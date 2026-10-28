/** An error whose userMessage is safe to show the user: no upstream body, no path, no secret. */
export class ProviderUserError extends Error {
  constructor(public readonly userMessage: string, internal?: string) {
    super(internal ?? userMessage);
    this.name = 'ProviderUserError';
  }
}

/** A model name reduced to characters that are safe to echo in a hint. */
export function safeModelName(model: string): string {
  return model.replace(/[^A-Za-z0-9_.:\-\/]/g, '').slice(0, 80);
}

/** Map a native Ollama failure to a clear error, or null when the generic path should handle it. */
export function ollamaStatusError(status: number, body: string, model: string): ProviderUserError | null {
  if (status === 404 && /not found|pull/i.test(body)) {
    const m = safeModelName(model);
    return new ProviderUserError(`Model "${m}" is not installed in Ollama. run: ollama pull ${m}`, `ollama 404 model ${m}`);
  }
  if (status === 500 && /tool|parse|invalid|unmarshal|json/i.test(body)) {
    return new ProviderUserError('The local model produced a malformed tool call. Try again, or rephrase the request.', 'ollama 500 malformed tool call');
  }
  return null;
}
