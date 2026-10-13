/** Transcript entry kind Hei writes when the user asks for the last reply again. */
export const REGENERATE_ENTRY = "hei.regenerate";

/**
 * What a regenerate entry records: the message Hei sends again. The entry omits the original message and its reply from
 * the model's context, so the model answers it afresh; the UI shows the message once, with the new reply.
 */
export type RegenerateNote = { resubmitted: string };
