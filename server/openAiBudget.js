import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { dataDir } from "./localSecurity.js";

const openAiUsageFile = path.join(dataDir, "openai-usage.json");
let openAiUsageLock = Promise.resolve();
let openAiReservedValue = 0;
const withOpenAiLock = (action) => {
  const result = openAiUsageLock.then(action, action);
  openAiUsageLock = result.catch(() => undefined);
  return result;
};
const billingMonth = () => {
  const timeZone = process.env.OPENAI_BILLING_TIME_ZONE || "Europe/Rome";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    return `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}`;
  } catch {
    throw new Error("OPENAI_BILLING_TIME_ZONE non è valido");
  }
};
async function readOpenAiUsage() {
  try {
    const value = JSON.parse(await fs.readFile(openAiUsageFile, "utf8"));
    return value.month === billingMonth() &&
      Number.isFinite(value.cost) && value.cost >= 0 &&
      Number.isFinite(Number(value.inputTokens || 0)) && Number(value.inputTokens || 0) >= 0 &&
      Number.isFinite(Number(value.outputTokens || 0)) && Number(value.outputTokens || 0) >= 0
      ? value
      : { month: billingMonth(), cost: 0, inputTokens: 0, outputTokens: 0 };
  } catch (error) {
    if (error.code === "ENOENT")
      return { month: billingMonth(), cost: 0, inputTokens: 0, outputTokens: 0 };
    throw error;
  }
}
function estimateOpenAiCost(inputCharacters, maximumOutputTokens) {
  const inputRate = Number(process.env.OPENAI_INPUT_COST_PER_MILLION_USD || 0.25);
  const outputRate = Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION_USD || 2);
  if (![inputRate, outputRate].every((value) => Number.isFinite(value) && value >= 0))
    throw new Error("Tariffe OpenAI non valide nel file .env");
  const estimatedInputTokens = Math.ceil(Math.max(0, inputCharacters) / 3);
  return (estimatedInputTokens * inputRate + maximumOutputTokens * outputRate) / 1_000_000;
}
async function reserveOpenAiBudget(requiredEstimate = 0) {
  return withOpenAiLock(async () => {
    const usage = await readOpenAiUsage();
    const budget = Number(process.env.OPENAI_MONTHLY_BUDGET_USD || 10);
    const configuredEstimate = Number(process.env.OPENAI_MAX_REQUEST_COST_USD || 0.25);
    const estimate = Math.max(configuredEstimate, Number(requiredEstimate || 0));
    if (!Number.isFinite(budget) || budget < 0 || !Number.isFinite(estimate) || estimate < 0)
      throw new Error("Budget OpenAI non valido nel file .env");
    if (budget > 0 && usage.cost + openAiReservedValue + estimate > budget)
      throw new Error(`Budget OpenAI mensile di $${budget.toFixed(2)} raggiunto`);
    openAiReservedValue += estimate;
    return estimate;
  });
}
async function settleOpenAiBudget(reserved, usageData = {}) {
  return withOpenAiLock(async () => {
    try {
      const inputTokens = Number(usageData.input_tokens || 0);
      const outputTokens = Number(usageData.output_tokens || 0);
      const inputRate = Number(process.env.OPENAI_INPUT_COST_PER_MILLION_USD || 0.25);
      const outputRate = Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION_USD || 2);
      if (![inputTokens, outputTokens, inputRate, outputRate].every((value) => Number.isFinite(value) && value >= 0))
        throw new Error("Consumo OpenAI non valido");
      const usage = await readOpenAiUsage();
      usage.inputTokens = Number(usage.inputTokens || 0);
      usage.outputTokens = Number(usage.outputTokens || 0);
      usage.inputTokens += inputTokens;
      usage.outputTokens += outputTokens;
      usage.cost += (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
      await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
      const temporary = `${openAiUsageFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(usage, null, 2), { mode: 0o600 });
      await fs.rename(temporary, openAiUsageFile);
      return usage;
    } finally {
      openAiReservedValue = Math.max(0, openAiReservedValue - Number(reserved || 0));
    }
  });
}

export const getOpenAiReserved = () => openAiReservedValue;
export const openAiReserved = Object.freeze({ toJSON: () => openAiReservedValue });
export { readOpenAiUsage, estimateOpenAiCost, reserveOpenAiBudget, settleOpenAiBudget };

export async function budgetedOpenAiFetch(input, options) {
  const payload = JSON.parse(options.body);
  let reservation = await reserveOpenAiBudget(estimateOpenAiCost(options.body.length, payload.max_output_tokens));
  try {
    const response = await fetch(input, options);
    const data = await response.clone().json();
    const settledReservation = reservation;
    reservation = 0;
    await settleOpenAiBudget(settledReservation, data.usage || {});
    return response;
  } finally {
    if (reservation) await settleOpenAiBudget(reservation, {});
  }
}
