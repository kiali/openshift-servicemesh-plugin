// validations are grouped per 'objectType' first in the first map and 'name' in the inner map
export type Validations = { [key1: string]: { [key2: string]: ObjectValidation } };

export enum ValidationTypes {
  Error = 'error',
  Warning = 'warning',
  Correct = 'correct',
  Info = 'info'
}

export const IstioLevelToSeverity = {
  UNKNOWN: ValidationTypes.Info,
  ERROR: ValidationTypes.Error,
  WARNING: ValidationTypes.Warning,
  INFO: ValidationTypes.Info
};

export interface ObjectValidation {
  name: string;
  objectType: string;
  valid: boolean;
  checks: ObjectCheck[];
  references?: ObjectReference[];
}

export interface ObjectCheck {
  code?: string;
  message: string;
  severity: ValidationTypes;
  path: string;
}

export interface ObjectReference {
  objectType: string;
  name: string;
  namespace: string;
}

export interface ValidationMessage {
  description?: string;
  documentationUrl: string;
  level?: string;
  type: ValidationMessageType;
}

export interface StatusCondition {
  type: string;
  status: boolean;
  message: string;
}

export interface ValidationMessageType {
  code: string;
}
