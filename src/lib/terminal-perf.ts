/**
 * 终端性能埋点（仅开发模式）
 *
 * 指标：
 * - Render pipeline latency: 数据到达 → xterm.write() → 下一帧渲染
 * - Input submission latency: onData → invoke("terminal_input") → resolve
 */

const IS_DEV = import.meta.env.DEV;
const SAMPLE_INTERVAL = 100; // 每 100 次操作采样一次统计输出
const MAX_SAMPLES = 1000;

interface PerfStats {
  samples: number[];
  count: number;
}

function createStats(): PerfStats {
  return { samples: [], count: 0 };
}

function addSample(stats: PerfStats, valueMs: number): void {
  stats.samples.push(valueMs);
  if (stats.samples.length > MAX_SAMPLES) {
    stats.samples.shift();
  }
  stats.count++;
}

function getPercentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function reportStats(label: string, stats: PerfStats): void {
  if (stats.samples.length === 0) return;
  const sorted = [...stats.samples].sort((a, b) => a - b);
  const p50 = getPercentile(sorted, 50);
  const p95 = getPercentile(sorted, 95);
  console.debug(
    `[terminal-perf] ${label}: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms (n=${stats.samples.length})`
  );
}

/** 渲染管线延迟追踪 */
const renderStats = createStats();

/** 输入提交延迟追踪 */
const inputStats = createStats();

/**
 * 记录渲染管线延迟：从数据到达到 xterm.write() 完成后的下一帧
 * 在 useTerminalEvents 的 onOutput 回调中调用
 */
export function measureRenderStart(): number {
  return IS_DEV ? window.performance.now() : 0;
}

export function measureRenderEnd(startTime: number): void {
  if (!IS_DEV || startTime === 0) return;
  // 在下一帧测量，确保 xterm 渲染完成
  requestAnimationFrame(() => {
    const elapsed = window.performance.now() - startTime;
    addSample(renderStats, elapsed);
    if (renderStats.count % SAMPLE_INTERVAL === 0) {
      reportStats("render-pipeline", renderStats);
    }
  });
}

/**
 * 记录输入提交延迟：从 onData 到 invoke resolve
 */
export function measureInputStart(): number {
  return IS_DEV ? window.performance.now() : 0;
}

export function measureInputEnd(startTime: number): void {
  if (!IS_DEV || startTime === 0) return;
  const elapsed = window.performance.now() - startTime;
  addSample(inputStats, elapsed);
  if (inputStats.count % SAMPLE_INTERVAL === 0) {
    reportStats("input-submission", inputStats);
  }
}
