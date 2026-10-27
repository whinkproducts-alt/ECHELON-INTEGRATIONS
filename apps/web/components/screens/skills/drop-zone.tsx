'use client';
// Drag and drop target plus a real file button (keyboard and screen reader friendly). Pre-checks use the server's own
// limits from config/skill-pipeline.json; the server still re-checks everything (content, JSON and YAML shape).
import * as React from 'react';
import { UploadCloud } from 'lucide-react';
import { HoloBadge, HoloButton, HoloPanel } from '@/components/ui/holo';
import { cn } from '@/lib/utils';
import limits from '@/config/skill-pipeline.json';

export interface PreCheck { ok: boolean; error?: string }

export function preCheck(file: { name: string; size: number }): PreCheck {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!limits.allowedExtensions.includes(ext)) return { ok: false, error: `File type not allowed. Allowed: ${limits.allowedExtensions.join(' ')}` };
  if (file.size === 0) return { ok: false, error: 'File is empty' };
  if (file.size > limits.maxFileBytes) return { ok: false, error: `File exceeds ${Math.floor(limits.maxFileBytes / 1024)} KB` };
  return { ok: true };
}

export function DropZone({ busy, onFiles }: { busy: boolean; onFiles: (files: File[]) => void }) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const depth = React.useRef(0);
  const inputId = React.useId();
  const kb = Math.floor(limits.maxFileBytes / 1024);

  const take = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <HoloPanel tone={over ? 'accent' : 'deep'} glow={over ? 'strong' : 'soft'} brackets
      onDragEnter={(e) => { e.preventDefault(); depth.current += 1; setOver(true); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setOver(false); if (!busy) take(e.dataTransfer.files); }}
      className={cn('border-dashed', over && 'scale-[1.005]')} data-testid="skill-dropzone">
      <div className="flex flex-col items-center gap-4 px-2 py-10 text-center sm:py-14">
        <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ color: 'hsl(var(--holo-c))', background: 'hsl(var(--holo-c) / 0.1)', border: '1px solid hsl(var(--holo-c) / 0.4)' }}>
          <UploadCloud className="h-7 w-7" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-display text-xl font-semibold tracking-tight text-foreground">{over ? 'Release to upload' : 'Drop skill files here'}</p>
          <p className="text-sm text-muted-foreground">or choose files from your device. Several files at once are fine.</p>
        </div>
        <label htmlFor={inputId} className="sr-only">Choose skill files to upload</label>
        <input id={inputId} ref={inputRef} type="file" multiple accept={limits.allowedExtensions.join(',')} className="sr-only" tabIndex={-1}
          onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
        <HoloButton size="lg" loading={busy} onClick={() => inputRef.current?.click()} leftIcon={<UploadCloud className="h-4 w-4" aria-hidden />}>Choose files</HoloButton>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Accepted file types">
          {limits.allowedExtensions.map((x) => <li key={x}><HoloBadge tone="neutral">{x}</HoloBadge></li>)}
        </ul>
        <p className="font-mono text-xs text-muted-foreground">Up to {limits.maxFilesPerRequest} files per upload, {kb} KB each, {limits.dailyCap} new skills per day.</p>
      </div>
    </HoloPanel>
  );
}
