import { useEffect, useState } from "react";
import { Download, Upload, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Field, ModuleMessage } from "./FormBits";
type Doc = {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  created_at: string;
};
const mime: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export function ProjectDocuments({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]),
    [type, setType] = useState("WO/PO"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [link, setLink] = useState<{ name: string; url: string } | null>(null);
  async function load() {
    setError("");
    const { data, error } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setDocs(data ?? []);
  }
  useEffect(() => {
    void load();
    setLink(null);
  }, [projectId]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!mime[ext])
        throw new Error(
          "Choose a PDF, image, Excel workbook or Word document.",
        );
      if (file.size > 10485760)
        throw new Error("Document size must be below 10 MB.");
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Sign in again before uploading.");
      const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("project-documents")
        .upload(path, file, { contentType: mime[ext], upsert: false });
      if (uploadError) throw uploadError;
      const { error: metadataError } = await supabase
        .from("project_documents")
        .insert({
          project_id: projectId,
          document_type: type,
          file_path: path,
          file_name: file.name,
          uploaded_by: data.user.id,
        });
      if (metadataError) {
        const cleanup = await supabase.storage
          .from("project-documents")
          .remove([path]);
        throw new Error(
          metadataError.message +
            (cleanup.error
              ? " The uploaded file could not be cleaned up; contact the administrator."
              : ""),
        );
      }
      await load();
      setNotice("Document uploaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload document.");
    } finally {
      setBusy(false);
    }
  }
  async function download(d: Doc) {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.storage
        .from("project-documents")
        .createSignedUrl(d.file_path, 600);
      if (error) throw error;
      setLink({ name: d.file_name, url: data.signedUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to open document.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {error && <ModuleMessage tone="error">{error}</ModuleMessage>}
      {notice && <ModuleMessage tone="success">{notice}</ModuleMessage>}
      <div className="filter-row">
        <Field label="Document Type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {[
              "WO/PO",
              "Invoice",
              "Credit Note",
              "RA Bill",
              "Delivery Challan",
              "Client Confirmation",
              "Other",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <label className="outline-button file-picker">
          <Upload size={16} />
          Upload Document
          <input
            aria-label="Upload project document"
            disabled={busy}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {link && (
        <a
          className="outline-button"
          href={link.url}
          target="_blank"
          rel="noreferrer"
        >
          <Download size={16} />
          {link.name}
        </a>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Uploaded</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.file_name}</td>
                <td>{d.document_type}</td>
                <td>{new Date(d.created_at).toLocaleString("en-IN")}</td>
                <td>
                  <button
                    aria-label={`Open ${d.file_name}`}
                    title="Open document"
                    className="icon-button"
                    disabled={busy}
                    onClick={() => void download(d)}
                  >
                    <Download size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!docs.length && (
          <div className="empty-state">No project documents uploaded.</div>
        )}
      </div>
    </div>
  );
}
