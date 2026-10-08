"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileText, Trash2, Search, BookOpen, AlertCircle, RefreshCw, Loader2, Check } from "lucide-react";
import { fetchKnowledgeDocs, uploadKnowledgeDoc, deleteKnowledgeDoc, type KnowledgeDoc, fmtBytes } from "@/lib/api";

const typeColor: Record<string, string> = {
  pdf: "var(--red)", csv: "var(--green)", txt: "var(--amber)", docx: "var(--blue)",
};
const statusMap: Record<string, { cls: string; label: string }> = {
  indexed:    { cls: "badge-green", label: "Indexed"    },
  processing: { cls: "badge-blue",  label: "Processing" },
  pending:    { cls: "badge-amber", label: "Pending"    },
  failed:     { cls: "badge-red",   label: "Failed"     },
};

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      setDocs(await fetchKnowledgeDocs());
      setError(null);
    } catch { setError("Backend not reachable — showing local state only."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadDocs();
    const t = setInterval(() => {
      const hasProcessing = docs.some((d) => d.status === "processing" || d.status === "pending");
      if (hasProcessing) loadDocs();
    }, 5_000);
    return () => clearInterval(t);
  }, [loadDocs, docs]);

  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.file_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalChunks = docs.reduce((s, d) => s + (d.chunk_count ?? 0), 0);
  const indexedCount = docs.filter((d) => d.status === "indexed").length;

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(true); setError(null);
    try {
      for (const file of files) {
        const title = file.name.replace(/\.[^.]+$/, "");
        const created = await uploadKnowledgeDoc(file, title);
        setDocs((prev) => [{ ...created, file_name: file.name, file_size_bytes: file.size, chunk_count: null, error: null }, ...prev]);
      }
      setTimeout(loadDocs, 2_000);
    } catch { setError("Upload failed. Make sure the backend is running."); }
    finally { setUploading(false); }
  }, [loadDocs]);

  const handleDelete = useCallback(async (docId: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== docId));
    try { await deleteKnowledgeDoc(docId); } catch { loadDocs(); }
  }, [loadDocs]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Knowledge</h1>
          <p className="page-subtitle">Documents and sources your operators use to answer questions.</p>
        </div>
        <div className="flex-gap-8">
          <button className="icon-btn" onClick={loadDocs} title="Refresh">
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
          <button className="btn btn-primary btn-md" style={{ gap: 6 }} onClick={() => fileInputRef.current?.click()}>
            <Upload size={13} /> Add Knowledge
          </button>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.csv,.docx" style={{ display: "none" }}
            onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Documents",    value: docs.length,   color: "var(--blue)"   },
          { label: "Indexed",      value: indexedCount,  color: "var(--green)"  },
          { label: "Total Chunks", value: totalChunks,   color: "var(--purple)" },
        ].map((m, i) => (
          <div key={m.label} className="stat-card fade-in-up" style={{ animationDelay: `${i * 0.04}s`, opacity: 0 }}>
            <p className="metric-value" style={{ color: m.color }}>{m.value}</p>
            <p className="metric-label">{m.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: "var(--amber-dim)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--r)" }}>
          <AlertCircle size={14} color="var(--amber)" />
          <p style={{ fontSize: "12px", color: "var(--amber)" }}>{error}</p>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragOver ? "var(--brand)" : "var(--border)"}`,
          borderRadius: "var(--r-xl)", padding: "28px 24px", textAlign: "center",
          cursor: "pointer", background: dragOver ? "var(--brand-dim)" : "transparent",
          transition: "all 0.15s",
        }}
      >
        {uploading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Loader2 size={22} color="var(--text-3)" style={{ animation: "spin 1s linear infinite" }} />
            <p style={{ fontSize: "13px", color: "var(--text-3)" }}>Uploading and indexing…</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Upload size={22} color="var(--text-3)" />
            <p style={{ fontSize: "13px", color: "var(--text-2)", fontWeight: 500 }}>Drop files here or click to upload</p>
            <p style={{ fontSize: "11px", color: "var(--text-3)" }}>Supports PDF, TXT, CSV, DOCX</p>
          </div>
        )}
      </div>

      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
        <input className="input" placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
      </div>

      {/* Doc list */}
      <div className="card fade-in-up" style={{ padding: 0, overflow: "hidden", opacity: 0, animationDelay: "0.16s" }}>
        {loading ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {[1,2,3].map((i) => <div key={i} className="skeleton" style={{ height: 54, borderRadius: "var(--r)" }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 200 }}>
            <BookOpen size={28} />
            <p>{search ? "No documents match your search." : "No documents yet. Upload files to give your operators knowledge."}</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {["Document","Type","Size","Chunks","Status","Added"].map((h) => <th key={h}>{h}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const ext = (doc.file_name ?? doc.title).split(".").pop()?.toLowerCase() ?? "txt";
                const sm = statusMap[doc.status] ?? { cls: "badge-gray", label: doc.status };
                return (
                  <tr key={doc.id}>
                    <td>
                      <div className="flex-gap-8">
                        <div style={{
                          width: 28, height: 28, borderRadius: "var(--r-sm)",
                          background: `${typeColor[ext] ?? "var(--text-3)"}15`,
                          border: `1px solid ${typeColor[ext] ?? "var(--border)"}30`,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        }}>
                          <FileText size={13} color={typeColor[ext] ?? "var(--text-3)"} />
                        </div>
                        <div>
                          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{doc.title}</p>
                          {doc.file_name && (
                            <p style={{ fontSize: "11px", color: "var(--text-3)" }}>{doc.file_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><span style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", fontFamily: "monospace" }}>{ext}</span></td>
                    <td><span style={{ fontSize: "12px", color: "var(--text-3)" }}>{doc.file_size_bytes ? fmtBytes(doc.file_size_bytes) : "—"}</span></td>
                    <td>
                      <span style={{ fontSize: "12px", fontWeight: 500, color: doc.chunk_count ? "var(--green)" : "var(--text-3)" }}>
                        {doc.chunk_count != null ? doc.chunk_count : (doc.status === "processing" ? "…" : "—")}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${sm.cls}`} style={{ gap: 4 }}>
                        {doc.status === "processing" && <Loader2 size={9} style={{ animation: "spin 1s linear infinite" }} />}
                        {doc.status === "indexed" && <Check size={9} />}
                        {sm.label}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                        {doc.created_at ? new Date(doc.created_at).toLocaleDateString("en-IN") : "—"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        style={{ color: "var(--red)" }}
                        onClick={() => handleDelete(doc.id)}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}