const hasBatchConfirmationAudit = (record) => {
  const audit = record?.batchDeltaEvidence?.audit;
  return Boolean(
    audit &&
    Array.isArray(audit.issues) &&
    (audit.analyzedAt || audit.fetchedAt || audit.startedAt),
  );
};

export const hasAutoFixCompletionEvidence = (record) => {
  if (!record) return false;
  if (record.liveApproval !== true) return record.status === "Verificato";
  if (record.noWriteResolution === true) {
    return record.status === "Verificato" && record.frontendConfirmed === true && Boolean(record.verifiedAt);
  }
  const confirmation = record.confirmationAudit?.resolved === true || hasBatchConfirmationAudit(record);
  return record.status === "Verificato" &&
    record.writeConfirmed === true &&
    record.frontendConfirmed === true &&
    Boolean(record.verifiedAt) &&
    confirmation;
};

export const requiresAutoFixCompletionGate = (record) =>
  record?.liveApproval === true &&
  record?.writeConfirmed === true &&
  !["Ripristinato", "Esito incerto", "Bloccato"].includes(record?.status);
