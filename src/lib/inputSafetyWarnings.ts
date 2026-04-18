/**
 * Mirror of `services::ai::scrubber::redact_user_input` warning detection,
 * client-side. The Rust scrubber is still authoritative — every prompt is
 * re-scrubbed in the backend before reaching llama.cpp. This frontend
 * helper exists purely so the user sees the warning **before** clicking
 * Send, without paying an IPC round trip on every keystroke.
 *
 * SPEC §5 user-input策略：正则命中和高熵 token 都只**警告**不擦 ——
 * 用户决定是否继续。Probe-output 路径是另一回事（硬擦），不在这里。
 */

const ENTROPY_MIN_LEN = 20;
/** 与 Rust 端一致：UUID/hash ~3.9–4.0；base64 secret ~5.5–6.0；4.5 卡在中间 */
const ENTROPY_THRESHOLD = 4.5;

/** 与 Rust `is_token_char`：base64-friendly 字母数字 + URL-safe 符号 */
const TOKEN_SPLIT = /[^A-Za-z0-9+/=_-]+/;

export interface InputWarning {
  kind: "credential-pattern" | "high-entropy";
  /** 用户友好的中文短语；UI 直接展示。 */
  label: string;
}

interface PatternMatcher {
  re: RegExp;
  label: string;
}

const CREDENTIAL_PATTERNS: PatternMatcher[] = [
  {
    re: /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/,
    label: "PEM 密钥块",
  },
  { re: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/, label: "AWS access key" },
  {
    re: /authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/=-]+/i,
    label: "Authorization: Bearer header",
  },
  {
    re: /authorization\s*:\s*basic\s+[A-Za-z0-9+/=]+/i,
    label: "Authorization: Basic header",
  },
  {
    re: /(?:x-api-key|api[_-]?key|apikey)['"\s]*[:=]['"\s]*[A-Za-z0-9._~+/=-]+/i,
    label: "API key header",
  },
  {
    re: /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/,
    label: "JWT token",
  },
  {
    re: /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]+@[^\s/]+/i,
    label: "URI 内嵌凭据",
  },
];

export function detectInputWarnings(text: string): InputWarning[] {
  const warnings: InputWarning[] = [];
  if (text.length === 0) return warnings;

  // 去重：同类型只报一次（避免一个 token 触发多条）
  const seenLabels = new Set<string>();
  for (const p of CREDENTIAL_PATTERNS) {
    if (seenLabels.has(p.label)) continue;
    if (p.re.test(text)) {
      seenLabels.add(p.label);
      warnings.push({ kind: "credential-pattern", label: p.label });
    }
  }

  if (containsHighEntropyToken(text)) {
    warnings.push({
      kind: "high-entropy",
      label: "高熵字符串（疑似密钥）",
    });
  }

  return warnings;
}

function containsHighEntropyToken(text: string): boolean {
  for (const tok of text.split(TOKEN_SPLIT)) {
    if (tok.length >= ENTROPY_MIN_LEN && shannonEntropy(tok) >= ENTROPY_THRESHOLD) {
      return true;
    }
  }
  return false;
}

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const total = s.length;
  let entropy = 0;
  for (const c of counts.values()) {
    const p = c / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
