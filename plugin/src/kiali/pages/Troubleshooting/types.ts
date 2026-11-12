export type Attachment = {
  attachmentType: string;
  id?: string;
  isEditable?: boolean;
  kind: string;
  name: string;
  namespace: string;
  originalValue?: string;
  ownerName?: string;
  value: string;
};

export type OpenOLSFn = (
  prompt?: string,
  attachments?: Attachment[],
  submitImmediately?: boolean,
  hidePrompt?: boolean
) => void;

/** Lightspeed extension provider — a React hook that returns the openOLS function. */
export type UseOpenOLS = () => OpenOLSFn;
