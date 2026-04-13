import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, X, Copy, Trash2, ArrowRight } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { ocrAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function DocumentScanner() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState('');
  const fileRef = useRef(null);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(''); // Clear previous results
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const selected = e.dataTransfer.files?.[0];
    if (selected) {
      setFile(selected);
      setResult('');
    }
  };

  const handleScan = async () => {
    if (!file) return;
    
    setScanning(true);
    const loadingToast = toast.loading('Sending document to AI Scanner...');
    
    const formData = new FormData();
    formData.append('document', file);

    try {
      const res = await ocrAPI.analyze(formData);
      
      if (res.data.rawText) {
        setResult(res.data.rawText);
        toast.success('Text extracted successfully!', { id: loadingToast });
      } else {
        toast.error('No readable text found in this document.', { id: loadingToast });
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to scan document.', { id: loadingToast });
    }
    
    setScanning(false);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    toast.success('Copied to clipboard!');
  };

  const resetScanner = () => {
    setFile(null);
    setResult('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <PatientLayout title="AI Document Scanner">
      <div style={{ marginBottom: 24, maxWidth: 800 }}>
        <h2 style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 8 }}>
          AI Document Scanner
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 15, lineHeight: 1.5 }}>
          Instantly extract text from your medical documents. Upload a prescription, lab report, or scan to digitize its contents. This tool is private and does not save the document to your permanent medical history.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1.5fr)', gap: 24, alignItems: 'start' }}>
        
        {/* Left Side: Upload & Action */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)' }}>1. Select Document</h3>
          
          <input 
            ref={fileRef} 
            type="file" 
            accept=".jpg,.jpeg,.png,.pdf" 
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
          />

          {!file ? (
            <div 
              style={{
                border: `2px dashed ${dragging ? 'var(--teal)' : 'var(--gray-200)'}`,
                borderRadius: 12, padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? '#e6f7f5' : 'var(--gray-50)',
                transition: 'all 0.2s', minHeight: 200, display: 'flex', flexDirection: 'column',
                justifyContent: 'center'
              }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <Upload size={36} color={dragging ? "var(--teal)" : "var(--gray-400)"} style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4 }}>
                Click to browse or drag & drop
              </p>
              <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>JPG, PNG, or PDF</p>
            </div>
          ) : (
            <div style={{ 
              padding: '16px', borderRadius: 12, background: '#f0faf8', 
              border: '1.5px solid var(--teal)', display: 'flex', alignItems: 'center', gap: 12 
            }}>
              <CheckCircle size={24} color="var(--teal)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {file.name}
                </p>
                <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button onClick={resetScanner} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>
                <Trash2 size={18} />
              </button>
            </div>
          )}

          <button
            onClick={handleScan}
            disabled={!file || scanning}
            className="btn"
            style={{
              padding: '14px', borderRadius: 10, fontSize: 15, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: !file ? 'var(--gray-100)' : scanning ? 'var(--gray-200)' : 'linear-gradient(135deg, #7c3aed, #db2777)',
              color: !file || scanning ? 'var(--gray-400)' : 'white',
              cursor: !file || scanning ? 'not-allowed' : 'pointer',
              border: 'none', width: '100%'
            }}
          >
            {scanning ? 'Analyzing Image...' : (
              <>
                <span>✨</span> Run AI Extraction
              </>
            )}
          </button>
        </div>

        {/* Right Side: Results */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-800)' }}>2. Extraction Result</h3>
            {result && (
              <button 
                onClick={copyToClipboard}
                className="btn btn-sm btn-outline" 
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Copy size={14} /> Copy Text
              </button>
            )}
          </div>

          <div style={{ 
            flex: 1, background: 'var(--gray-50)', borderRadius: 12, 
            border: '1px solid var(--gray-200)', position: 'relative', overflow: 'hidden'
          }}>
            {!file && !result && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                <FileText size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                <p style={{ fontSize: 14 }}>Upload a document to see results</p>
              </div>
            )}

            {file && !result && !scanning && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                <ArrowRight size={32} style={{ color: 'var(--teal)', opacity: 0.5, marginBottom: 12 }} />
                <p style={{ fontSize: 14 }}>Ready to scan. Click the button!</p>
              </div>
            )}

            {scanning && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" style={{ marginBottom: 16 }} />
                <p style={{ fontSize: 14, color: 'var(--gray-500)', fontWeight: 500 }}>Extracting medical text...</p>
              </div>
            )}

            {result && (
              <pre style={{ 
                margin: 0, padding: 20, whiteSpace: 'pre-wrap', fontFamily: 'monospace', 
                fontSize: 14, color: 'var(--gray-800)', lineHeight: 1.6, height: '100%', overflowY: 'auto'
              }}>
                {result}
              </pre>
            )}
          </div>
        </div>

      </div>
    </PatientLayout>
  );
}
