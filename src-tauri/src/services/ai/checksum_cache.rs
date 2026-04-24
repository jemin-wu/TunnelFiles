//! GGUF SHA256 缓存（按 path + size + mtime_ns 失效）。
//!
//! 避免每次应用启动都对 4.6GB 模型完整 re-hash —— 在 M 系 Mac 上这是 3+ 秒
//! 的 CPU 满载阻塞（T1.5 实测启动 UX 退化）。缓存命中即跳过 `compute_gguf_sha256`，
//! 命中条件：(size, mtime_ns) 与当前磁盘文件的 metadata 一致。
//!
//! 不使用 HMAC / 文件签名：缓存文件被篡改最坏情况 = 绕过 sha256 比对到 FFI
//! 加载阶段，那里 `LlamaModel::load_from_file` 会用它自己的 GGUF header 校验
//! 兜底。本 cache 是**性能优化**，不是安全边界。
//!
//! 存储：`{data_local_dir}/TunnelFiles/models/.checksums.json`
//! 格式：`{ "entries": { "<abs-path>": { "size": N, "mtimeNs": N, "sha256": "<hex>" } } }`
//! 原子写：tempfile + rename（避免并发崩溃留下部分写入的坏 JSON）。

use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use super::paths;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumEntry {
    pub size: u64,
    pub mtime_ns: i128,
    pub sha256: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct CacheFile {
    entries: HashMap<String, ChecksumEntry>,
}

/// 从磁盘读取当前文件 metadata（size + mtime_ns）。
///
/// 返回 None 当文件不存在 / 无权限 / mtime 早于 UNIX_EPOCH（不可能在正常系统
/// 出现，但 NTP 回拨等边缘情况下保守处理）。调用方 None → cache miss 语义。
pub fn current_metadata(path: &Path) -> Option<(u64, i128)> {
    let meta = std::fs::metadata(path).ok()?;
    let size = meta.len();
    let mtime = meta.modified().ok()?;
    let mtime_ns = match mtime.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_nanos() as i128,
        Err(e) => -(e.duration().as_nanos() as i128),
    };
    Some((size, mtime_ns))
}

/// 查找缓存命中的 sha256。
///
/// 命中条件：cache 文件存在 + entry 存在 + (size, mtime_ns) 完全匹配。
/// 任一环节失败（IO / JSON 解析 / 条件不符）→ None，调用方重算。
///
/// 解析失败不删文件：下次 `store` 会整体覆写。
pub fn lookup(path: &Path) -> Option<String> {
    let (size, mtime_ns) = current_metadata(path)?;
    let cache_path = paths::checksum_cache_file_path()?;
    let key = path.to_string_lossy().into_owned();
    let cache = read_cache(&cache_path)?;
    let entry = cache.entries.get(&key)?;
    if entry.size == size && entry.mtime_ns == mtime_ns {
        Some(entry.sha256.clone())
    } else {
        None
    }
}

/// 存入/更新一条缓存。写失败静默忽略（下次启动再算一遍而已，不影响正确性）。
pub fn store(path: &Path, sha256: &str) {
    let Some((size, mtime_ns)) = current_metadata(path) else {
        return;
    };
    let Some(cache_path) = paths::checksum_cache_file_path() else {
        return;
    };
    let key = path.to_string_lossy().into_owned();
    let mut cache = read_cache(&cache_path).unwrap_or_default();
    cache.entries.insert(
        key,
        ChecksumEntry {
            size,
            mtime_ns,
            sha256: sha256.to_string(),
        },
    );
    let _ = write_cache_atomic(&cache_path, &cache);
}

fn read_cache(cache_path: &Path) -> Option<CacheFile> {
    let raw = std::fs::read_to_string(cache_path).ok()?;
    serde_json::from_str::<CacheFile>(&raw).ok()
}

fn write_cache_atomic(cache_path: &Path, cache: &CacheFile) -> std::io::Result<()> {
    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let raw = serde_json::to_string_pretty(cache)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let tmp = cache_path.with_extension("json.tmp");
    std::fs::write(&tmp, raw)?;
    std::fs::rename(&tmp, cache_path)?;
    Ok(())
}

/// 测试用：直接读写指定路径的 cache 文件（不依赖 data_local_dir）。
#[cfg(test)]
pub(crate) fn lookup_at(cache_path: &Path, target: &Path) -> Option<String> {
    let (size, mtime_ns) = current_metadata(target)?;
    let cache = read_cache(cache_path)?;
    let key = target.to_string_lossy().into_owned();
    let entry = cache.entries.get(&key)?;
    if entry.size == size && entry.mtime_ns == mtime_ns {
        Some(entry.sha256.clone())
    } else {
        None
    }
}

#[cfg(test)]
pub(crate) fn store_at(cache_path: &Path, target: &Path, sha256: &str) {
    let Some((size, mtime_ns)) = current_metadata(target) else {
        return;
    };
    let key = target.to_string_lossy().into_owned();
    let mut cache = read_cache(cache_path).unwrap_or_default();
    cache.entries.insert(
        key,
        ChecksumEntry {
            size,
            mtime_ns,
            sha256: sha256.to_string(),
        },
    );
    let _ = write_cache_atomic(cache_path, &cache);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn make_file(dir: &Path, name: &str, content: &[u8]) -> PathBuf {
        let p = dir.join(name);
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(content).unwrap();
        f.sync_all().unwrap();
        p
    }

    #[test]
    fn lookup_returns_none_when_cache_file_missing() {
        let dir = tempdir().unwrap();
        let target = make_file(dir.path(), "m.gguf", b"abc");
        let cache_path = dir.path().join(".checksums.json");
        assert!(lookup_at(&cache_path, &target).is_none());
    }

    #[test]
    fn store_then_lookup_returns_stored_hash() {
        let dir = tempdir().unwrap();
        let target = make_file(dir.path(), "m.gguf", b"hello");
        let cache_path = dir.path().join(".checksums.json");
        store_at(&cache_path, &target, "deadbeef");
        assert_eq!(lookup_at(&cache_path, &target).as_deref(), Some("deadbeef"));
    }

    #[test]
    fn lookup_misses_when_size_changed() {
        let dir = tempdir().unwrap();
        let target = make_file(dir.path(), "m.gguf", b"hello");
        let cache_path = dir.path().join(".checksums.json");
        store_at(&cache_path, &target, "deadbeef");
        // Rewrite with different size
        std::fs::write(&target, b"hello world").unwrap();
        assert!(lookup_at(&cache_path, &target).is_none());
    }

    #[test]
    fn lookup_misses_when_mtime_changed() {
        let dir = tempdir().unwrap();
        let target = make_file(dir.path(), "m.gguf", b"samesize");
        let cache_path = dir.path().join(".checksums.json");
        store_at(&cache_path, &target, "deadbeef");
        // Same content, but re-touch to bump mtime. Sleep to defeat
        // sub-second mtime granularity on some filesystems.
        std::thread::sleep(std::time::Duration::from_millis(1100));
        std::fs::write(&target, b"samesize").unwrap();
        assert!(lookup_at(&cache_path, &target).is_none());
    }

    #[test]
    fn store_overwrites_existing_entry() {
        let dir = tempdir().unwrap();
        let target = make_file(dir.path(), "m.gguf", b"v1");
        let cache_path = dir.path().join(".checksums.json");
        store_at(&cache_path, &target, "hash-v1");
        // Rewrite file and store again with fresh hash
        std::thread::sleep(std::time::Duration::from_millis(1100));
        std::fs::write(&target, b"v2content").unwrap();
        store_at(&cache_path, &target, "hash-v2");
        assert_eq!(lookup_at(&cache_path, &target).as_deref(), Some("hash-v2"));
    }

    #[test]
    fn corrupt_cache_file_is_treated_as_miss() {
        let dir = tempdir().unwrap();
        let target = make_file(dir.path(), "m.gguf", b"hello");
        let cache_path = dir.path().join(".checksums.json");
        std::fs::write(&cache_path, "{ not valid json").unwrap();
        assert!(lookup_at(&cache_path, &target).is_none());
        // store_at should recover by overwriting
        store_at(&cache_path, &target, "fresh");
        assert_eq!(lookup_at(&cache_path, &target).as_deref(), Some("fresh"));
    }

    #[test]
    fn distinct_paths_do_not_collide() {
        let dir = tempdir().unwrap();
        let a = make_file(dir.path(), "a.gguf", b"aaa");
        let b = make_file(dir.path(), "b.gguf", b"bbb");
        let cache_path = dir.path().join(".checksums.json");
        store_at(&cache_path, &a, "hash-a");
        store_at(&cache_path, &b, "hash-b");
        assert_eq!(lookup_at(&cache_path, &a).as_deref(), Some("hash-a"));
        assert_eq!(lookup_at(&cache_path, &b).as_deref(), Some("hash-b"));
    }
}
