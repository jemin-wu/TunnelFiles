use serde::{Deserialize, Serialize};

/// 文件条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// 修改时间 (Unix 时间戳，秒)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime: Option<i64>,
    /// 文件权限 (Unix mode)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<u32>,
}

/// 排序字段
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortField {
    #[default]
    Name,
    Size,
    Mtime,
}

/// 排序顺序
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    #[default]
    Asc,
    Desc,
}

/// 排序规格
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SortSpec {
    pub field: SortField,
    pub order: SortOrder,
}

impl Default for SortSpec {
    fn default() -> Self {
        Self {
            field: SortField::Name,
            order: SortOrder::Asc,
        }
    }
}
