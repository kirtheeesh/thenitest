import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, FileSpreadsheet, Send, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import * as XLSX from 'xlsx';
import { parse, isValid, format } from 'date-fns';

const DataEntry: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [previewData, setPreviewData] = useState<any[]>([]);

  // Bulk Upload State
  const [file, setFile] = useState<File | null>(null);

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        // Auto-detect format by checking for "Entry No" in the first few rows
        let data: any[] = XLSX.utils.sheet_to_json(ws);
        const firstRow = data[0] || {};
        
        if (!firstRow['Entry No'] && !firstRow['entryNo']) {
          // Try skipping 3 rows (headers at row 4)
          data = XLSX.utils.sheet_to_json(ws, { range: 3 });
        }
        
        // Extract date from filename if possible (e.g., "cashier wise 03032026.xls")
        const fileName = file.name;
        const dateMatch = fileName.match(/(\d{2})(\d{2})(\d{4})/);
        let fileDateStr = "";
        if (dateMatch) {
          fileDateStr = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
        }
        
        const processed = data.map(item => {
          // Robust mapping for potential column name variations
          const getVal = (keys: string[]) => {
            // First try exact matches
            for (const k of keys) {
              if (item[k] !== undefined) return item[k];
            }
            // Then try case-insensitive matches
            const itemKeys = Object.keys(item);
            for (const k of keys) {
              const foundKey = itemKeys.find(ik => ik.toLowerCase() === k.toLowerCase());
              if (foundKey) return item[foundKey];
            }
            return undefined;
          };

          const billAmtVal = Number(getVal(['Bill Amt', 'billAmt', 'Bill Amount', 'Total Amt']) || 0);
          const entryNoVal = String(getVal(['Entry No', 'entryNo', 'EntryNo', 'Bill No', 'BillNo']) || '').trim();
          const groupBillNoVal = String(getVal(['GroupBillno', 'groupBillNo', 'BillNo', 'Grp Bill', 'GroupName', 'GroupBillNo']) || '').trim();

          // Use raw date string as it is in the Excel file
          let finalDateStr = '';
          const rawDate = getVal(['Entry Date', 'entryDate', 'Date']);
          
          if (rawDate !== undefined && rawDate !== null) {
            if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
              // If Excel parsed it as a Date object, use UTC to avoid timezone shifts
              const d = rawDate.getUTCDate();
              const m = rawDate.getUTCMonth() + 1;
              const y = rawDate.getUTCFullYear();
              finalDateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
            } else {
              // Otherwise use the literal string value
              finalDateStr = String(rawDate).trim();
            }
          }

          // If date is missing in Excel, use date from filename
          if (!finalDateStr || finalDateStr === "undefined") {
            finalDateStr = fileDateStr;
          }

          let floor = 1;
          // Parse floor from groupBillNo (e.g., "1FL/000001" -> 1 floor)
          if (groupBillNoVal && groupBillNoVal.includes('FL')) {
            const floorMatch = groupBillNoVal.match(/^(\d+)FL/);
            if (floorMatch) {
              floor = parseInt(floorMatch[1]);
            }
          }

          return {
            entryNo: entryNoVal,
            entryDate: finalDateStr,
            cashier: String(getVal(['Cashier', 'cashier']) || 'Unknown').trim(),
            floor: floor,
            cash: Number(getVal(['Cash', 'cash', 'Cash Amt']) || 0),
            card: Number(getVal(['Card', 'card', 'Card Amt']) || 0),
            cheque: Number(getVal(['Cheque', 'cheque', 'Cheque Amt']) || 0),
            others: Number(getVal(['Others', 'others', 'Other Amt']) || 0),
            balance: Number(getVal(['Balance', 'balance', 'Bal', 'Balance Amt']) || 0),
            billAmt: billAmtVal,
            discAmt: Number(getVal(['Disc Amt', 'discAmt', 'Disc', 'Discount']) || 0),
            refundAmt: Number(getVal(['Refund Amt', 'refundAmt', 'Refund']) || 0),
            customer: String(getVal(['Customer', 'customer', 'Cust Name']) || '').trim(),
            cusMob: String(getVal(['CUSMob', 'cusMob', 'Mobile', 'Phone', 'CUSMoB']) || '').trim(),
            groupBillNo: groupBillNoVal,
          };
        }).filter(item => item.entryNo && (item.billAmt !== undefined && item.billAmt !== null));

        setPreviewData(processed);
        setLoading(false);
        setMessage({ text: `Loaded ${processed.length} rows for review.`, type: 'success' });
      };
      reader.readAsBinaryString(file);
    } catch (err: any) {
      setMessage({ text: 'Error reading file', type: 'error' });
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    if (previewData.length === 0) return;
    setLoading(true);
    try {
      const response = await api.post('/api/transactions/bulk-json', { transactions: previewData });
      const savedCount = response.data.count ?? previewData.length;
      const totalCount = response.data.total ?? previewData.length;
      
      setMessage({ 
        text: `data inserted successfully (${savedCount} of ${totalCount} records saved)`, 
        type: 'success' 
      });
      setPreviewData([]);
      setFile(null);

      // Show custom success notification
      setShowSuccess(true);
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || 'Error saving data', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const removePreviewRow = (index: number) => {
    setPreviewData(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-in fade-in duration-500">
      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg scale-[1.02]">
          <Upload size={16} />
          Bulk Upload
        </div>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 border ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

        <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
            <Upload size={40} />
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Upload Excel File</h3>
          <p className="text-gray-500 text-center mb-8 max-w-sm">
            Please use an Excel file with the following columns. <strong>Bold columns are required:</strong>
            <br />
            <strong>Entry No</strong>, <strong>Bill Amt</strong>, <strong>Entry Date</strong>, <strong>Cashier</strong>, 
            Customer, Mobile, Group Bill No, Cash, Card, Cheque, Others, Balance, Disc Amt, Refund Amt.
          </p>
          
          <form onSubmit={handleBulkUpload} className="w-full max-w-md space-y-6">
            <div className="relative group">
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center group-hover:border-blue-400 group-hover:bg-blue-50/30 transition">
                <FileSpreadsheet className="mx-auto text-gray-300 group-hover:text-blue-500 mb-3" size={32} />
                <span className="text-sm font-medium text-gray-600">
                  {file ? file.name : 'Click or drag to select file'}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!file || loading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50"
            >
              <Upload size={18} />
              {loading ? 'Processing File...' : 'Preview Excel Data'}
            </button>
          </form>

          {previewData.length > 0 && (
            <div className="w-full mt-12 space-y-4 animate-in fade-in duration-500">
              <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div>
                  <h4 className="font-bold text-blue-900 text-lg">Review Import Data</h4>
                  <p className="text-blue-700 text-sm">{previewData.length} transactions ready to be saved</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setPreviewData([])}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-white rounded-lg transition font-semibold"
                  >
                    <Trash2 size={18} />
                    Clear
                  </button>
                  <button 
                    onClick={handleSaveAll}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold shadow-md active:scale-95 disabled:opacity-50"
                  >
                    <Send size={18} />
                    {loading ? 'Saving...' : 'Save All Records'}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-2">Entry No</th>
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Cashier</th>
                      <th className="px-2 py-2 text-right">Cash</th>
                      <th className="px-2 py-2 text-right">Card</th>
                      <th className="px-2 py-2 text-right">Cheque</th>
                      <th className="px-2 py-2 text-right">Others</th>
                      <th className="px-2 py-2 text-right">Bal</th>
                      <th className="px-2 py-2 text-right font-bold text-gray-800">Bill Amt</th>
                      <th className="px-2 py-2 text-right">Disc</th>
                      <th className="px-2 py-2 text-right">Refund</th>
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {previewData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-2 py-1.5 font-medium text-gray-700">{row.entryNo}</td>
                        <td className="px-2 py-1.5 text-gray-500">{row.entryDate}</td>
                        <td className="px-2 py-1.5 text-gray-600 uppercase text-[9px] truncate max-w-[80px]">{row.cashier}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{row.cash.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{row.card.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{row.cheque.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{row.others.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-red-600 font-bold">{row.balance.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right font-bold text-gray-800">{row.billAmt.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{row.discAmt.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{row.refundAmt.toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-gray-500 truncate max-w-[80px]">{row.customer}</td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => removePreviewRow(idx)}
                            className="text-red-500 hover:text-red-700 transition"
                            title="Remove row"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.length > 50 && (
                  <div className="p-3 bg-gray-50 text-center text-xs text-gray-400 border-t border-gray-100">
                    Showing first 50 rows only...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      {showSuccess && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
          <div className="text-center space-y-4 max-w-sm w-full">
            <h2 className="text-4xl font-black text-gray-900 tracking-tight">Success!</h2>
            <p className="text-gray-500 font-medium">Your data has been uploaded successfully</p>
            
            <div className="py-12 flex justify-center">
              <div className="w-32 h-32 rounded-full border-[3px] border-emerald-400 flex items-center justify-center bg-transparent">
                <svg 
                  className="w-16 h-16 text-emerald-400" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-[#00d1a0] hover:bg-[#00b88d] text-white font-black py-4 rounded-xl shadow-lg shadow-emerald-100 transition-all active:scale-95 text-lg"
            >
              continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataEntry;
