import { z } from 'zod';
// Fixed, documented variants make exact content review possible. Never accept arbitrary provider paths or URLs.
export const mediaInputSchema = z.object({
  kind: z.enum(['image', 'video']),
  prompt: z.string().trim().min(1).max(4000),
}).strict();
export type MediaInput = z.infer<typeof mediaInputSchema>;
export function providerRequest(input: MediaInput) {
  return input.kind === 'image'
    ? { model: 'alibaba/qwen-image-3/text-to-image', body: { prompt: input.prompt, resolution: '1k', aspect_ratio: '1:1', enable_thinking: false, prompt_extend: false } }
    : { model: 'bytedance/seedance-2.0/text-to-video', body: { prompt: input.prompt, duration: 5, resolution: '720p', aspect_ratio: '16:9', generate_audio: true } };
}
