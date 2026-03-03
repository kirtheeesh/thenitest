import * as React from 'react';
import { useState } from 'react';
import { Upload, Plus, FileSpreadsheet, Send, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import api from '../lib/api';
import * as XLSX from 'xlsx';
import { parse, isValid, format } from 'date-fns';

const DataEntry: React.FC = () => {
  // activeTab removed: only manual entry UI is shown now
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [previewData, setPreviewData] = useState<any[]>([]);

  // Manual Form State
  const [formData, setFormData] = useState({
    entryNo: '',
    entryDate: new Date().toISOString().split('T')[0],
    cashier: '',
    floor: 1,
    billAmt: '',
    cusMob: '',
    cash: '',
    card: '',
    cheque: '',
    others: '',
    balance: '',
    discAmt: '',
    refundAmt: '',
    customer: '',
    groupBillNo: ''
  });

  // Bulk Upload State
  const [file, setFile] = useState<File | null>(null);
  const [uploadFloor, setUploadFloor] = useState(1);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      await api.post('/api/transactions/manual', {
        ...formData,
        floor: Number(formData.floor),
        billAmt: Number(formData.billAmt),
        cash: Number(formData.cash || 0),
        card: Number(formData.card || 0),
        cheque: Number(formData.cheque || 0),
        others: Number(formData.others || 0),
        balance: Number(formData.balance || 0),
        discAmt: Number(formData.discAmt || 0),
        refundAmt: Number(formData.refundAmt || 0),
      });
      setMessage({ text: 'data inserted successfully', type: 'success' });
      setFormData({
        ...formData,
        entryNo: '',
        billAmt: '',
        cusMob: '',
        cash: '',
        card: '',
        cheque: '',
        others: '',
        balance: '',
        discAmt: '',
        refundAmt: '',
        customer: '',
        groupBillNo: ''
      });
    } catch (err: any) {
      setMessage({ text: err.response?.data?.message || 'Error saving transaction', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

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
        const data: any[] = XLSX.utils.sheet_to_json(ws);
        
        const processed = data.map(item => {
          // Robust mapping for potential column name variations
          const getVal = (keys: string[]) => {
            const key = keys.find(k => {
              if (item[k] !== undefined) return true;
              // Also check case-insensitive match
              const found = Object.keys(item).find(ik => ik.toLowerCase() === k.toLowerCase());
              return found !== undefined;
            });
            if (key) return item[key];
            const found = keys.map(k => Object.keys(item).find(ik => ik.toLowerCase() === k.toLowerCase())).find(f => f !== undefined);
            return found ? item[found] : undefined;
          };

          const billAmtVal = Number(getVal(['Bill Amt', 'billAmt', 'Bill Amount', 'Total Amt']) || 0);
          const entryNoVal = String(getVal(['Entry No', 'entryNo', 'EntryNo', 'Bill No', 'BillNo']) || '').trim();

          // Set entry date as today's date instead of from Excel
          const finalDateStr = new Date().toISOString().split('T')[0];

          return {
            entryNo: entryNoVal,
            entryDate: finalDateStr,
            cashier: String(getVal(['Cashier', 'cashier']) || 'Unknown').trim(),
            floor: uploadFloor,
            cash: Number(getVal(['Cash', 'cash', 'Cash Amt']) || 0),
            card: Number(getVal(['Card', 'card', 'Card Amt']) || 0),
            cheque: Number(getVal(['Cheque', 'cheque', 'Cheque Amt']) || 0),
            others: Number(getVal(['Others', 'others', 'Other Amt']) || 0),
            balance: Number(getVal(['Balance', 'balance', 'Bal', 'Balance Amt']) || 0),
            billAmt: billAmtVal,
            discAmt: Number(getVal(['Disc Amt', 'discAmt', 'Disc', 'Discount']) || 0),
            refundAmt: Number(getVal(['Refund Amt', 'refundAmt', 'Refund']) || 0),
            customer: String(getVal(['Customer', 'customer', 'Cust Name']) || '').trim(),
            cusMob: String(getVal(['CUSMob', 'cusMob', 'Mobile', 'Phone']) || '').trim(),
            groupBillNo: String(getVal(['GroupBillno', 'groupBillNo', 'BillNo', 'Grp Bill', 'GroupName']) || '').trim(),
          };
        }).filter(item => item.entryNo && item.billAmt > 0);

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
        <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg scale-[1.02]">
          <Plus size={16} />
          Manual Entry
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

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in zoom-in-95 duration-500">
          <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Entry No</label>
              <input
                type="text"
                required
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.entryNo}
                onChange={(e) => setFormData({...formData, entryNo: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Entry Date</label>
              <input
                type="date"
                required
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.entryDate}
                onChange={(e) => setFormData({...formData, entryDate: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Cashier Name</label>
              <input
                type="text"
                required
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.cashier}
                onChange={(e) => setFormData({...formData, cashier: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Floor</label>
              <select
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm cursor-pointer"
                value={formData.floor}
                onChange={(e) => setFormData({...formData, floor: Number(e.target.value)})}
              >
                <option value={1}>Floor 1</option>
                <option value={2}>Floor 2</option>
                <option value={3}>Floor 3</option>
                <option value={4}>Floor 4</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Cash Amount</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.cash}
                onChange={(e) => setFormData({...formData, cash: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Card Amount</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.card}
                onChange={(e) => setFormData({...formData, card: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Cheque</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.cheque}
                onChange={(e) => setFormData({...formData, cheque: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Others</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.others}
                onChange={(e) => setFormData({...formData, others: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Balance</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm text-red-600"
                value={formData.balance}
                onChange={(e) => setFormData({...formData, balance: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Bill Amount</label>
              <input
                type="number"
                step="0.01"
                required
                className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2 text-sm font-black text-blue-700 focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.billAmt}
                onChange={(e) => setFormData({...formData, billAmt: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Disc Amt</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.discAmt}
                onChange={(e) => setFormData({...formData, discAmt: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Refund Amt</label>
              <input
                type="number"
                step="0.01"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.refundAmt}
                onChange={(e) => setFormData({...formData, refundAmt: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Customer Name</label>
              <input
                type="text"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.customer}
                onChange={(e) => setFormData({...formData, customer: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Mobile No</label>
              <input
                type="text"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.cusMob}
                onChange={(e) => setFormData({...formData, cusMob: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Group Bill No</label>
              <input
                type="text"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm"
                value={formData.groupBillNo}
                onChange={(e) => setFormData({...formData, groupBillNo: e.target.value})}
              />
            </div>
            <div className="md:col-span-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-orange-600 to-orange-500 text-white font-black py-3 rounded-2xl shadow-xl hover:shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
              >
                <Send size={18} />
                {loading ? 'Submitting...' : 'Save Transaction'}
              </button>
            </div>
          </form>
        </div>
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
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Select Target Floor</label>
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={uploadFloor}
                onChange={(e) => setUploadFloor(Number(e.target.value))}
              >
                <option value={1}>Floor 1</option>
                <option value={2}>Floor 2</option>
                <option value={3}>Floor 3</option>
                <option value={4}>Floor 4</option>
              </select>
            </div>

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
    </div>
  );
};

export default DataEntry;
