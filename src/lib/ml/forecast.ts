/**
 * ML-based workload forecasting (best-practice implementation)
 *
 * - Time-series split: chronological 80/20 (no future leakage)
 * - Metrics on held-out test set only
 * - Feature scaling (Z-score) for numerical stability
 * - Ridge regression (L2) to reduce overfitting
 * - Baseline comparison: naive last-value, 3-month moving average
 * - 95% prediction intervals from residual distribution
 */

import { mean, standardDeviation } from "simple-statistics";

export interface DataPoint {
  date: Date;
  value: number;
}

export interface ScaleParams {
  mean: number[];
  std: number[];
}

export interface TrainingResult {
  coefficients: number[];
  scaleParams: ScaleParams;
  mae: number;
  rmse: number;
  r2: number;
  residualStd: number;
  featureNames: string[];
  /** Test set size */
  testSize: number;
  /** Baseline: naive last-value MAE */
  baselineNaiveMae: number;
  /** Baseline: 3-month moving average MAE */
  baselineMovingAvgMae: number;
  /** Improvement over naive (0-1, higher = better) */
  improvementVsNaive: number;
}

export interface ForecastPoint {
  month: string;
  predicted: number;
  low: number;
  high: number;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RIDGE_LAMBDA = 0.1;

/**
 * Create features: [1, t, sin(2π*m/12), cos(2π*m/12)]
 */
function createFeatures(data: DataPoint[]): { X: number[][]; y: number[] } {
  const X: number[][] = [];
  const y: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const month = data[i].date.getMonth();
    X.push([1, i, Math.sin((2 * Math.PI * month) / 12), Math.cos((2 * Math.PI * month) / 12)]);
    y.push(data[i].value);
  }
  return { X, y };
}

/**
 * Z-score scaling (column 0 = intercept, kept as 1)
 */
function computeScaleParams(X: number[][]): ScaleParams {
  const k = X[0].length;
  const meanArr: number[] = [];
  const stdArr: number[] = [];
  for (let j = 0; j < k; j++) {
    const col = X.map((row) => row[j]);
    meanArr[j] = j === 0 ? 1 : mean(col);
    stdArr[j] = j === 0 ? 1 : Math.max(standardDeviation(col) || 1e-8, 1e-8);
  }
  return { mean: meanArr, std: stdArr };
}

function scaleFeatures(X: number[][], params: ScaleParams): number[][] {
  return X.map((row) =>
    row.map((v, j) => (params.std[j] > 0 ? (v - params.mean[j]) / params.std[j] : v))
  );
}

function scaleSingle(x: number[], params: ScaleParams): number[] {
  return x.map((v, j) => (params.std[j] > 0 ? (v - params.mean[j]) / params.std[j] : v));
}

/**
 * Ridge regression: (X'X + λI)β = X'y
 */
function ridgeFit(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length;
  const k = X[0].length;
  const XtX: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty: number[] = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let p = 0; p < k; p++) {
      for (let q = 0; q < k; q++) XtX[p][q] += X[i][p] * X[i][q];
      Xty[p] += X[i][p] * y[i];
    }
  }
  for (let p = 0; p < k; p++) XtX[p][p] += lambda;
  const inv = invert4x4(XtX);
  return Xty.map((_, p) => inv[p].reduce((s, inv_pq, q) => s + inv_pq * Xty[q], 0));
}

function invert4x4(m: number[][]): number[][] {
  const a = m;
  const inv: number[][] = [];
  const s0 = a[0][0] * a[1][1] - a[0][1] * a[1][0];
  const s1 = a[0][0] * a[1][2] - a[0][2] * a[1][0];
  const s2 = a[0][0] * a[1][3] - a[0][3] * a[1][0];
  const s3 = a[0][1] * a[1][2] - a[0][2] * a[1][1];
  const s4 = a[0][1] * a[1][3] - a[0][3] * a[1][1];
  const s5 = a[0][2] * a[1][3] - a[0][3] * a[1][2];
  const c5 = a[2][2] * a[3][3] - a[2][3] * a[3][2];
  const c4 = a[2][1] * a[3][3] - a[2][3] * a[3][1];
  const c3 = a[2][1] * a[3][2] - a[2][2] * a[3][1];
  const c2 = a[2][0] * a[3][3] - a[2][3] * a[3][0];
  const c1 = a[2][0] * a[3][2] - a[2][2] * a[3][0];
  const c0 = a[2][0] * a[3][1] - a[2][1] * a[3][0];
  const det = s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0;
  if (Math.abs(det) < 1e-10) throw new Error("Singular matrix");
  inv[0] = [
    (a[1][1] * c5 - a[1][2] * c4 + a[1][3] * c3) / det,
    (-a[0][1] * c5 + a[0][2] * c4 - a[0][3] * c3) / det,
    (a[3][1] * s5 - a[3][2] * s4 + a[3][3] * s3) / det,
    (-a[2][1] * s5 + a[2][2] * s4 - a[2][3] * s3) / det,
  ];
  inv[1] = [
    (-a[1][0] * c5 + a[1][2] * c2 - a[1][3] * c1) / det,
    (a[0][0] * c5 - a[0][2] * c2 + a[0][3] * c1) / det,
    (-a[3][0] * s5 + a[3][2] * s2 - a[3][3] * s1) / det,
    (a[2][0] * s5 - a[2][2] * s2 + a[2][3] * s1) / det,
  ];
  inv[2] = [
    (a[1][0] * c4 - a[1][1] * c2 + a[1][3] * c0) / det,
    (-a[0][0] * c4 + a[0][1] * c2 - a[0][3] * c0) / det,
    (a[3][0] * s4 - a[3][1] * s2 + a[3][3] * s0) / det,
    (-a[2][0] * s4 + a[2][1] * s2 - a[2][3] * s0) / det,
  ];
  inv[3] = [
    (-a[1][0] * c3 + a[1][1] * c1 - a[1][2] * c0) / det,
    (a[0][0] * c3 - a[0][1] * c1 + a[0][2] * c0) / det,
    (-a[3][0] * s3 + a[3][1] * s1 - a[3][2] * s0) / det,
    (a[2][0] * s3 - a[2][1] * s1 + a[2][2] * s0) / det,
  ];
  return inv;
}

function predict(X: number[][], coefficients: number[]): number[] {
  return X.map((x) => x.reduce((s, xi, i) => s + xi * coefficients[i], 0));
}

function computeMetrics(y: number[], pred: number[]): { mae: number; rmse: number; r2: number } {
  const residuals = y.map((yi, i) => yi - pred[i]);
  const mae = mean(residuals.map((r) => Math.abs(r)));
  const rmse = Math.sqrt(mean(residuals.map((r) => r * r)));
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const meanY = mean(y);
  const ssTot = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { mae, rmse, r2 };
}

/** Naive baseline: predict last known value for all test points */
function baselineNaiveMae(trainData: DataPoint[], testData: DataPoint[]): number {
  if (testData.length === 0 || trainData.length === 0) return 0;
  const lastVal = trainData[trainData.length - 1].value;
  const errors = testData.map((d) => Math.abs(d.value - lastVal));
  return mean(errors);
}

/** Moving average baseline: 3-month MA for next month */
function baselineMovingAvgMae(data: DataPoint[], testStartIdx: number): number {
  const window = 3;
  const errors: number[] = [];
  for (let i = testStartIdx; i < data.length; i++) {
    const start = Math.max(0, i - window);
    const slice = data.slice(start, i);
    const avg = mean(slice.map((d) => d.value));
    errors.push(Math.abs(data[i].value - avg));
  }
  return errors.length > 0 ? mean(errors) : 0;
}

/**
 * Train with time-series split, evaluate on test set, retrain on full data for production.
 */
export function trainModel(data: DataPoint[]): { coefficients: number[]; scaleParams: ScaleParams; result: TrainingResult } {
  if (data.length < 8) throw new Error("Need at least 8 data points for train/test split");

  const splitIdx = Math.max(6, Math.floor(data.length * 0.8));
  const trainData = data.slice(0, splitIdx);
  const testData = data.slice(splitIdx);

  const { X: XTrain, y: yTrain } = createFeatures(trainData);
  const { X: XTest, y: yTest } = createFeatures(testData);

  const scaleParams = computeScaleParams(XTrain);
  const XTrainScaled = scaleFeatures(XTrain, scaleParams);
  const XTestScaled = scaleFeatures(XTest, scaleParams);

  const coefficients = ridgeFit(XTrainScaled, yTrain, RIDGE_LAMBDA);
  const testPred = predict(XTestScaled, coefficients);
  const { mae, rmse, r2 } = computeMetrics(yTest, testPred);

  const trainPred = predict(XTrainScaled, coefficients);
  const trainResiduals = yTrain.map((yi, i) => yi - trainPred[i]);
  const residualStd =
    Math.sqrt(trainResiduals.reduce((s, r) => s + r * r, 0) / Math.max(1, trainResiduals.length - 4)) || 3;

  const baselineNaive = baselineNaiveMae(trainData, testData);
  const baselineMA = baselineMovingAvgMae(data, splitIdx);
  const improvementVsNaive = baselineNaive > 0 ? 1 - mae / baselineNaive : 0;

  const result: TrainingResult = {
    coefficients,
    scaleParams,
    mae: Math.round(mae * 100) / 100,
    rmse: Math.round(rmse * 100) / 100,
    r2: Math.round(r2 * 10000) / 10000,
    residualStd: Math.round(residualStd * 100) / 100,
    featureNames: ["intercept", "time", "month_sin", "month_cos"],
    testSize: testData.length,
    baselineNaiveMae: Math.round(baselineNaive * 100) / 100,
    baselineMovingAvgMae: Math.round(baselineMA * 100) / 100,
    improvementVsNaive: Math.round(improvementVsNaive * 100) / 100,
  };

  const fullX = [...XTrain, ...XTest];
  const fullY = [...yTrain, ...yTest];
  const fullScaleParams = computeScaleParams(fullX);
  const fullXScaled = scaleFeatures(fullX, fullScaleParams);
  const finalCoefficients = ridgeFit(fullXScaled, fullY, RIDGE_LAMBDA);

  return {
    coefficients: finalCoefficients,
    scaleParams: fullScaleParams,
    result,
  };
}

/**
 * Generate forecasts with 95% prediction intervals
 */
export function forecastFromCoefficients(
  coefficients: number[],
  lastIndex: number,
  horizon: number,
  residualStd: number,
  scaleParams?: ScaleParams
): ForecastPoint[] {
  const result: ForecastPoint[] = [];
  const z = 1.96;

  for (let i = 1; i <= horizon; i++) {
    const t = lastIndex + i;
    const month = (t % 12 + 12) % 12;
    const x = [1, t, Math.sin((2 * Math.PI * month) / 12), Math.cos((2 * Math.PI * month) / 12)];
    const xScaled = scaleParams ? scaleSingle(x, scaleParams) : x;
    const pred = xScaled.reduce((s, xi, j) => s + xi * coefficients[j], 0);
    const margin = z * residualStd * Math.sqrt(1 + i * 0.15);
    result.push({
      month: MONTH_NAMES[month],
      predicted: Math.round(Math.max(0, Math.min(100, pred))),
      low: Math.round(Math.max(0, pred - margin)),
      high: Math.round(Math.min(100, pred + margin)),
    });
  }
  return result;
}

/**
 * Build trend (historical + predicted) from coefficients
 */
export function buildTrendFromCoefficients(
  data: DataPoint[],
  coefficients: number[],
  futureMonths: number,
  scaleParams?: ScaleParams
): { month: string; actual: number | null; predicted: number }[] {
  const result: { month: string; actual: number | null; predicted: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const month = data[i].date.getMonth();
    const x = [1, i, Math.sin((2 * Math.PI * month) / 12), Math.cos((2 * Math.PI * month) / 12)];
    const xScaled = scaleParams ? scaleSingle(x, scaleParams) : x;
    const pred = xScaled.reduce((s, xi, j) => s + xi * coefficients[j], 0);
    result.push({
      month: MONTH_NAMES[month],
      actual: Math.round(data[i].value),
      predicted: Math.round(Math.max(0, Math.min(100, pred))),
    });
  }
  const lastIdx = data.length - 1;
  for (let i = 1; i <= futureMonths; i++) {
    const t = lastIdx + i;
    const month = (t % 12 + 12) % 12;
    const x = [1, t, Math.sin((2 * Math.PI * month) / 12), Math.cos((2 * Math.PI * month) / 12)];
    const xScaled = scaleParams ? scaleSingle(x, scaleParams) : x;
    const pred = xScaled.reduce((s, xi, j) => s + xi * coefficients[j], 0);
    result.push({
      month: MONTH_NAMES[month],
      actual: null,
      predicted: Math.round(Math.max(0, Math.min(100, pred))),
    });
  }
  return result;
}

/**
 * Feature importance from normalized coefficient magnitudes
 */
export function getFeatureImportance(coefficients: number[]): { feature: string; importance: number }[] {
  const names = ["Time trend", "Seasonality (sin)", "Seasonality (cos)"];
  const absCoef = coefficients.slice(1).map((c) => Math.abs(c));
  const total = absCoef.reduce((s, c) => s + c, 0) || 1;
  return names.slice(0, absCoef.length).map((name, i) => ({
    feature: name,
    importance: Math.round((absCoef[i] / total) * 100) / 100,
  }));
}
