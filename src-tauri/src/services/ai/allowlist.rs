//! Shell 命令白名单引擎 (T2.2)
//!
//! 使用 tree-sitter-bash 解析 shell 命令为 AST，然后：
//! 1. 拒绝任何包含危险结构的 AST（展开、管道、重定向等）
//! 2. 拒绝一切未显式白名单的命令（fail-closed）
//! 3. 返回规范化的 argv[] 供安全执行

use tree_sitter::{Language, Node, Parser};

// ── 公共类型 ──────────────────────────────────────────────────────────────────

/// 通过白名单检查的命令，argv 已规范化。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckedCommand {
    pub argv: Vec<String>,
}

/// 白名单引擎的决策结果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Allow(CheckedCommand),
    /// v0.3+ 激活：展示 argv 给用户确认。v0.2 暂未启用。
    RequireConfirm(CheckedCommand),
    Deny(String),
}

// ── 拒绝的 AST 节点类型 ───────────────────────────────────────────────────────

const DENIED_NODE_KINDS: &[&str] = &[
    "command_substitution", // $(...)  `...`
    "process_substitution", // <(...) >(...)
    "heredoc_redirect",     // << EOF
    "herestring_redirect",  // <<< string
    "ansi_c_string",        // $'...'
    "pipeline",             // a | b
    "list",                 // a ; b  a && b  a || b
    "redirected_statement", // 任何带重定向的命令
    "brace_expression",     // {1..3}
    "negated_command",      // ! cmd
    "subshell",             // (...)
    "arithmetic_expansion", // $((...))
];

/// 危险的 shell 解释器命令（直接调用即拒绝）
const SHELL_INTERPRETERS: &[&str] = &["sh", "bash", "zsh", "dash", "ksh", "eval", "source", "exec"];

// ── 白名单规则 ────────────────────────────────────────────────────────────────

struct AllowRule {
    /// argv[0]（命令名）
    cmd: &'static str,
    /// Some([...]) → argv[1] 必须匹配其中之一；None → 任何参数均允许
    first_arg: Option<&'static [&'static str]>,
}

impl AllowRule {
    const fn any(cmd: &'static str) -> Self {
        AllowRule {
            cmd,
            first_arg: None,
        }
    }
    const fn subcommand(cmd: &'static str, args: &'static [&'static str]) -> Self {
        AllowRule {
            cmd,
            first_arg: Some(args),
        }
    }
}

/// 10 条只读白名单规则（SPEC §5 T2.2）
const ALLOW_RULES: &[AllowRule] = &[
    AllowRule::any("ls"),
    AllowRule::any("cat"),
    AllowRule::any("stat"),
    AllowRule::any("ps"),
    AllowRule::any("df"),
    AllowRule::any("du"),
    AllowRule::subcommand("systemctl", &["status"]),
    AllowRule::any("journalctl"),
    AllowRule::subcommand("docker", &["ps"]),
    AllowRule::subcommand("nginx", &["-t"]),
];

// ── 公开 API ──────────────────────────────────────────────────────────────────

/// 检查 shell 命令字符串是否在白名单中。
/// 成功时返回 `Decision::Allow(CheckedCommand)`，包含规范化 argv。
/// 任何策略违规返回 `Decision::Deny(reason)`。
/// Fail-closed：未显式允许的命令一律拒绝。
pub fn check(input: &str) -> Decision {
    let trimmed = input.trim();

    if trimmed.is_empty() {
        return Decision::Deny("空命令".to_string());
    }

    // 长度保护，防止解析器复杂度攻击
    if trimmed.len() > 10_000 {
        return Decision::Deny("命令过长".to_string());
    }

    let mut parser = Parser::new();
    if let Err(e) = parser.set_language(&bash_language()) {
        return Decision::Deny(format!("语言加载失败: {e}"));
    }

    let tree = match parser.parse(trimmed, None) {
        Some(t) => t,
        None => return Decision::Deny("AST 解析失败".to_string()),
    };

    let root = tree.root_node();
    let src = trimmed.as_bytes();

    // Step 1：扫描全 AST，拒绝危险节点
    if let Some(reason) = scan_dangerous(&root, src) {
        return Decision::Deny(reason);
    }

    // Step 2：顶层必须是且仅是一个 `command` 节点（无管道/列表/if/for）
    let meaningful: Vec<Node> = (0..root.child_count())
        .filter_map(|i| root.child(i))
        .filter(|n| n.is_named() && n.kind() != "comment")
        .collect();

    if meaningful.len() != 1 {
        let kinds: Vec<&str> = meaningful.iter().map(|n| n.kind()).collect();
        return Decision::Deny(format!("不允许多语句结构: {:?}", kinds));
    }

    let stmt = &meaningful[0];
    if stmt.kind() != "command" {
        return Decision::Deny(format!("不允许的语句类型: {}", stmt.kind()));
    }

    // Step 3：提取 argv
    let argv = extract_argv(stmt, src);
    if argv.is_empty() {
        return Decision::Deny("无法提取命令名".to_string());
    }

    // Step 4：拒绝直接调用 shell 解释器
    if SHELL_INTERPRETERS.contains(&argv[0].as_str()) {
        return Decision::Deny(format!("不允许调用 shell 解释器: {}", argv[0]));
    }

    // Step 5：匹配白名单规则（fail-closed）
    for rule in ALLOW_RULES {
        if argv[0] != rule.cmd {
            continue;
        }
        if let Some(required) = rule.first_arg {
            match argv.get(1).map(String::as_str) {
                None => {
                    return Decision::Deny(format!(
                        "{} 缺少必要参数（允许: {:?}）",
                        rule.cmd, required
                    ))
                }
                Some(a) if !required.contains(&a) => {
                    return Decision::Deny(format!(
                        "{} {} 不在白名单中（允许: {:?}）",
                        rule.cmd, a, required
                    ))
                }
                _ => {}
            }
        }
        return Decision::Allow(CheckedCommand { argv });
    }

    Decision::Deny(format!("命令 '{}' 不在白名单中", argv[0]))
}

// ── 内部工具函数 ──────────────────────────────────────────────────────────────

fn bash_language() -> Language {
    tree_sitter_bash::language()
}

/// 递归扫描 AST，返回第一个危险节点的描述，无则 None。
fn scan_dangerous(node: &Node, src: &[u8]) -> Option<String> {
    let kind = node.kind();

    if DENIED_NODE_KINDS.contains(&kind) {
        return Some(format!("不允许的 shell 结构: {}", kind));
    }

    // 变量间接引用：${!var}
    if kind == "expansion" {
        if let Ok(text) = node.utf8_text(src) {
            if text.starts_with("${!") {
                return Some("不允许变量间接引用: ${!...}".to_string());
            }
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if let Some(reason) = scan_dangerous(&child, src) {
            return Some(reason);
        }
    }

    None
}

/// 从 `command` 节点提取 argv 向量。
/// expansion/command_substitution 等危险节点已在 scan_dangerous 中被捕获。
fn extract_argv(node: &Node, src: &[u8]) -> Vec<String> {
    let mut argv = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "command_name" => {
                // command_name 内部包含实际的 word/variable 节点
                let mut inner = child.walk();
                for inner_child in child.children(&mut inner) {
                    if let Ok(text) = inner_child.utf8_text(src) {
                        let t = text.trim();
                        if !t.is_empty() {
                            argv.push(t.to_string());
                            break;
                        }
                    }
                }
            }
            "word" | "raw_string" | "number_literal" => {
                if let Ok(text) = child.utf8_text(src) {
                    let t = text.trim();
                    if !t.is_empty() {
                        argv.push(t.to_string());
                    }
                }
            }
            "string" => {
                // 带引号的字符串，去除外层引号
                if let Ok(text) = child.utf8_text(src) {
                    let inner = text
                        .trim()
                        .trim_start_matches('"')
                        .trim_end_matches('"')
                        .trim_start_matches('\'')
                        .trim_end_matches('\'');
                    if !inner.is_empty() {
                        argv.push(inner.to_string());
                    }
                }
            }
            _ => {} // 忽略重定向、分号等 — 这些已在 scan_dangerous 中被捕获
        }
    }

    argv
}

// ── 单元测试 ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn allow_argv(input: &str) -> Vec<String> {
        match check(input) {
            Decision::Allow(cmd) => cmd.argv,
            other => panic!("期望 Allow，但得到 {:?} for {:?}", other, input),
        }
    }

    fn assert_deny(input: &str) {
        match check(input) {
            Decision::Deny(_) => {}
            other => panic!("期望 Deny，但得到 {:?} for {:?}", other, input),
        }
    }

    // ─── 10 条白名单规则 ───────────────────────────────────────────────────────

    #[test]
    fn allow_ls_bare() {
        assert_eq!(allow_argv("ls"), vec!["ls"]);
    }

    #[test]
    fn allow_ls_with_flags() {
        let argv = allow_argv("ls -la /tmp");
        assert_eq!(argv[0], "ls");
        assert!(argv.contains(&"-la".to_string()));
    }

    #[test]
    fn allow_cat_file() {
        let argv = allow_argv("cat /etc/nginx/nginx.conf");
        assert_eq!(argv[0], "cat");
    }

    #[test]
    fn allow_stat_file() {
        let argv = allow_argv("stat /var/log/syslog");
        assert_eq!(argv[0], "stat");
    }

    #[test]
    fn allow_ps_aux() {
        let argv = allow_argv("ps aux");
        assert_eq!(argv[0], "ps");
    }

    #[test]
    fn allow_df_h() {
        let argv = allow_argv("df -h");
        assert_eq!(argv[0], "df");
    }

    #[test]
    fn allow_du_sh() {
        let argv = allow_argv("du -sh /var");
        assert_eq!(argv[0], "du");
    }

    #[test]
    fn allow_systemctl_status() {
        let argv = allow_argv("systemctl status nginx");
        assert_eq!(argv[0], "systemctl");
        assert_eq!(argv[1], "status");
    }

    #[test]
    fn allow_journalctl_n() {
        let argv = allow_argv("journalctl -n 100");
        assert_eq!(argv[0], "journalctl");
    }

    #[test]
    fn allow_docker_ps() {
        let argv = allow_argv("docker ps");
        assert_eq!(argv[0], "docker");
        assert_eq!(argv[1], "ps");
    }

    #[test]
    fn allow_nginx_t() {
        let argv = allow_argv("nginx -t");
        assert_eq!(argv[0], "nginx");
        assert_eq!(argv[1], "-t");
    }

    // ─── 拒绝：管道 ───────────────────────────────────────────────────────────

    #[test]
    fn deny_pipe_rm() {
        assert_deny("ls; rm -rf /");
    }

    #[test]
    fn deny_pipe_and() {
        assert_deny("ls && rm x");
    }

    #[test]
    fn deny_pipe_or() {
        assert_deny("ls || rm x");
    }

    #[test]
    fn deny_pipe_to_rm() {
        assert_deny("ls | rm x");
    }

    // ─── 拒绝：重定向 ─────────────────────────────────────────────────────────

    #[test]
    fn deny_redirect_write() {
        assert_deny("ls > /etc/passwd");
    }

    #[test]
    fn deny_redirect_append() {
        assert_deny("ls >> /etc/hosts");
    }

    // ─── 拒绝：命令替换 ───────────────────────────────────────────────────────

    #[test]
    fn deny_command_substitution() {
        assert_deny("ls $(rm x)");
    }

    // ─── 拒绝：不在白名单的命令 ───────────────────────────────────────────────

    #[test]
    fn deny_rm() {
        assert_deny("rm -rf /");
    }

    #[test]
    fn deny_systemctl_start() {
        assert_deny("systemctl start nginx");
    }

    #[test]
    fn deny_docker_exec() {
        assert_deny("docker exec nginx bash");
    }

    #[test]
    fn deny_nginx_start() {
        assert_deny("nginx -s reload");
    }

    #[test]
    fn deny_sudo() {
        assert_deny("sudo ls");
    }

    #[test]
    fn deny_shell_interpreter_bash() {
        assert_deny("bash -c 'rm x'");
    }

    #[test]
    fn deny_eval() {
        assert_deny("eval 'rm x'");
    }

    // ─── 边界条件 ─────────────────────────────────────────────────────────────

    #[test]
    fn deny_empty() {
        assert_deny("");
    }

    #[test]
    fn deny_too_long() {
        assert_deny(&"a".repeat(10_001));
    }

    #[test]
    fn deny_unknown_command() {
        assert_deny("foo --bar");
    }
}
