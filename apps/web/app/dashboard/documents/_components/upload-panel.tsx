'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, CheckCircle, Trash2, FileText, Loader2 } from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

interface Document {
  id: string;
  name: string;
  size?: number;
  createdAt?: string;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string }
  | { status: 'success'; fileName: string }
  | { status: 'error'; message: string };

/**
 * UploadPanel — document upload and list UI (C6 frontend).
 *
 * - All colours from design tokens only.
 * - Labels from useTenantConfig().
 * - All states: idle, uploading, success, error (type mismatch 415, size exceeded 413).
 */
export function UploadPanel() {
  const cfg = useTenantConfig();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load existing documents — kept as a plain function (not called from useEffect directly)
  const loadDocuments = () => {
    setDocsLoading(true);
    fetch('/api/documents')
      .then(r => r.json())
      .then(d => { setDocuments(Array.isArray(d?.documents) ? d.documents : []); setDocsLoading(false); })
      .catch(() => { setDocuments([]); setDocsLoading(false); });
  };

  useEffect(() => {
    // Restructured as a .then() chain to satisfy the SSR lint rule
    fetch('/api/documents')
      .then(r => r.json())
      .then(d => { setDocuments(Array.isArray(d?.documents) ? d.documents : []); setDocsLoading(false); })
      .catch(() => { setDocuments([]); setDocsLoading(false); });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input for re-selection
    if (fileRef.current) fileRef.current.value = '';

    setUploadState({ status: 'uploading', fileName: file.name });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 413) {
        setUploadState({ status: 'error', message: 'File exceeds the maximum allowed size.' });
        return;
      }
      if (res.status === 415) {
        setUploadState({ status: 'error', message: 'Unsupported file type. Allowed: PDF, DOCX, plain text, Markdown.' });
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setUploadState({ status: 'error', message: body?.error ?? 'Upload failed. Please try again.' });
        return;
      }

      setUploadState({ status: 'success', fileName: file.name });
      loadDocuments();
    } catch {
      setUploadState({ status: 'error', message: 'Network error. Please try again.' });
    }
  };

  const handleDelete = async (doc: Document) => {
    if (deletingId) return;
    setDeletingId(doc.id);
    try {
      await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch {
      // Non-blocking
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-4 transition-colors hover:border-primary/50">
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        <div className="text-center">
          <p className="text-sm text-foreground font-medium">
            {cfg.uploadDocumentLabel}
          </p>
          <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD — max 25 MB</p>
        </div>
        <label className="cursor-pointer">
          <span
            className="px-4 py-2 text-sm rounded-md font-medium transition-opacity hover:opacity-90"
            style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
          >
            Choose file
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="sr-only"
            onChange={handleFileChange}
            disabled={uploadState.status === 'uploading'}
          />
        </label>
      </div>

      {/* Upload state feedback */}
      {uploadState.status === 'uploading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Uploading {uploadState.fileName}…</span>
        </div>
      )}

      {uploadState.status === 'success' && (
        <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'hsl(var(--whink-accent))' }}>
          <CheckCircle className="h-4 w-4" aria-hidden />
          <span>{uploadState.fileName} uploaded successfully.</span>
          <button
            onClick={() => setUploadState({ status: 'idle' })}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {uploadState.status === 'error' && (
        <div
          className="flex items-center gap-2 text-sm font-mono rounded-md px-3 py-2 border"
          style={{
            color: 'hsl(var(--destructive))',
            borderColor: 'hsl(var(--destructive) / 0.3)',
            background: 'hsl(var(--destructive) / 0.05)',
          }}
          role="alert"
        >
          <span className="flex-1">{uploadState.message}</span>
          <button
            onClick={() => setUploadState({ status: 'idle' })}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Document list */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3 font-display">Your documents</h2>
        {docsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-card animate-pulse rounded-md" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" aria-hidden />
            <p className="text-sm">No documents yet. Upload one to get started.</p>
          </div>
        ) : (
          <ul className="space-y-2" aria-label="Uploaded documents">
            {documents.map(doc => (
              <li
                key={doc.id}
                className="flex items-center gap-3 px-3 py-2.5 bg-card rounded-lg border border-border"
              >
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                <span className="flex-1 text-sm text-foreground truncate">{doc.name}</span>
                {doc.size != null && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {Math.round(doc.size / 1024)} KB
                  </span>
                )}
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deletingId === doc.id}
                  aria-label={`Delete ${doc.name}`}
                  className="p-1.5 rounded text-muted-foreground transition-colors disabled:opacity-40"
                  onMouseEnter={e => (e.currentTarget.style.color = 'hsl(var(--destructive))')}
                  onMouseLeave={e => (e.currentTarget.style.color = '')}
                >
                  {deletingId === doc.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    : <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  }
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
