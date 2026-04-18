//! AI Shell Copilot 服务层
//!
//! 对外暴露的模块会在 Phase 1/2/3 逐步增加。

pub mod chat;
pub mod health;
pub mod llama_runtime;
pub mod paths;
pub mod prompt;
pub mod scrubber;
