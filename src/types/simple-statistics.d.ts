declare module "simple-statistics" {
  export function mean(x: number[]): number;
  export function min(x: number[]): number;
  export function max(x: number[]): number;
  export function sum(x: number[]): number;
  export function standardDeviation(x: number[]): number;
  export function linearRegression(data: [number, number][]): { m: number; b: number };
}

