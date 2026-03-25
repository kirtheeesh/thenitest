import * as React from 'react';
import { useState, useEffect, useContext } from 'react';
import { SidebarContext } from '../components/Layout';
import { 
  Users, IndianRupee, Smartphone, PhoneOff, 
  ArrowDownCircle, ArrowUpCircle, Gift, 
  FileDown, FileSpreadsheet, Search,
  AlertCircle, ChevronUp, RotateCcw
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area 
} from 'recharts';
import api from '../lib/api';
import { format } from 'date-fns';

const COLORS = ['#f97316', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const formatDateUTC = (dateInput: any) => {
  if (!dateInput) return '-';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '-';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
};

const Dashboard: React.FC = () => {
  const [filters, setFilters] = useState({
    floor: 'All',
    cashier: 'All',
    startDate: '1970-01-01', // Show all data by default
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const [cashiers, setCashiers] = useState<string[]>([]);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [showFilters] = useState(true);
  const { isSidebarOpen } = useContext(SidebarContext);

  const fetchCashiers = async (floor: string) => {
    try {
      const response = await api.get(`/api/cashiers?floor=${floor}`);
      setCashiers(response.data);
    } catch (err) {
      console.error('Error fetching cashiers');
    }
  };

  useEffect(() => {
    setError('');
    fetchCashiers(filters.floor);
  }, [filters.floor]);

  useEffect(() => {
    setError('');
    handleGenerateReport();
  }, [filters]);

  const handleGenerateReport = async () => {
    // Validation
    if (new Date(filters.endDate) < new Date(filters.startDate)) {
      setError('End date cannot be before start date');
      return;
    }
    if (new Date(filters.endDate) > new Date()) {
      setError('Future dates not allowed');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(filters);
      const response = await api.get(`/api/reports/generate?${params.toString()}`);
      setReportData(response.data);
    } catch (err) {
      setError('Error generating report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: 'pdf' | 'excel', preview: boolean = false) => {
    try {
      console.log(`Starting ${type} ${preview ? 'view' : 'export'}...`);
      const params = new URLSearchParams(filters);
      if (preview && type === 'pdf') {
        params.append('view', 'true');
      }
      
      const endpoint = type === 'pdf' ? '/api/reports/export-pdf' : '/api/reports/export-excel';
      const response = await api.get(`${endpoint}?${params.toString()}`, {
        responseType: 'blob',
      });
      
      if (response.data.type === 'application/json') {
        const text = await response.data.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.message || 'Export failed');
      }

      // Extract filename from Content-Disposition if available
      const contentDisposition = response.headers['content-disposition'];
      let filename = `${filters.cashier || 'All'}_Report.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      const blobType = type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const file = response.data instanceof Blob ? response.data : new Blob([response.data], { type: blobType });
      const url = window.URL.createObjectURL(file);

      if (preview && type === 'pdf') {
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          if (link.parentNode) document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 500);
      }
    } catch (err: any) {
      console.error(`Error ${preview ? 'viewing' : 'exporting'} ${type.toUpperCase()}:`, err);
      setError(`Error ${preview ? 'viewing' : 'exporting'} ${type.toUpperCase()}: ${err.message}`);
    }
  };

  const handleExportAnalytics = async (type: 'pdf' | 'excel', preview: boolean = false) => {
    try {
      console.log(`Starting analytics ${type} ${preview ? 'view' : 'export'}...`);
      const params = new URLSearchParams(filters);
      if (preview && type === 'pdf') {
        params.append('view', 'true');
      }
      
      const endpoint = type === 'pdf' ? '/api/reports/export-analytics-pdf' : '/api/reports/export-analytics-excel';
      const response = await api.get(`${endpoint}?${params.toString()}`, {
        responseType: 'blob',
      });
      
      if (response.data.type === 'application/json') {
        const text = await response.data.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.message || 'Export failed');
      }

      const contentDisposition = response.headers['content-disposition'];
      let filename = `Analytics_${filters.cashier || 'All'}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      const blobType = type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const file = response.data instanceof Blob ? response.data : new Blob([response.data], { type: blobType });
      const url = window.URL.createObjectURL(file);

      if (preview && type === 'pdf') {
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
          if (link.parentNode) document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 500);
      }
    } catch (err: any) {
      console.error(`Error ${preview ? 'viewing' : 'exporting'} analytics ${type.toUpperCase()}:`, err);
      setError(`Error ${preview ? 'viewing' : 'exporting'} analytics ${type.toUpperCase()}: ${err.message}`);
    }
  };

  const pieData = reportData ? [
    { name: 'With Mobile', value: reportData.metrics.withMobile },
    { name: 'Without Mobile', value: reportData.metrics.withoutMobile },
  ] : [];

  const barData = reportData ? [
    { name: 'Below ₹100', value: reportData.metrics.below100 },
    { name: 'Above ₹100', value: reportData.metrics.above100 },
  ] : [];

  return (
    <div className="animate-in fade-in duration-500 max-w-[100%]">
      {/* Filters & Top Actions Section - Sticky Header */}
      <div className={`sticky top-0 z-[100] bg-gray-50/80 backdrop-blur-md py-2 px-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 mb-2 items-center transition-all duration-300 shadow-sm border-b border-gray-100`}>
  
        <section className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-blue-100 flex-1 ring-4 ring-white/50">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Floor</label>
              <select
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
                value={filters.floor}
                onChange={(e) => setFilters({ ...filters, floor: e.target.value, cashier: '' })}
              >
                <option value="All">All Floors</option>
                <option value="1">Floor 1</option>
                <option value="2">Floor 2</option>
                <option value="3">Floor 3</option>
                <option value="4">Floor 4</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Cashier</label>
              <select
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
                value={filters.cashier}
                onChange={(e) => setFilters({ ...filters, cashier: e.target.value })}
              >
                <option value="All">All Cashiers</option>
                {cashiers.map((cashier) => (
                  <option key={cashier} value={cashier}>{cashier}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Start Date</label>
              <input
                type="date"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">End Date</label>
              <input
                type="date"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* Integrated Professional Actions Bar */}
        <div className="flex flex-row bg-white/50 backdrop-blur-sm p-1.5 rounded-2xl shadow-lg border border-white/50 ring-1 ring-blue-50 gap-2 items-center lg:items-center ml-auto transition-all duration-500">
          <button
            onClick={() => handleGenerateReport()}
            disabled={loading}
            className="p-3 bg-white text-gray-600 border border-gray-200 rounded-2xl hover:bg-gray-50 transition-all active:scale-95 disabled:opacity-50"
            title="Refresh Data"
          >
            <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          
          <button
            onClick={() => setShowReport(!showReport)}
            className={`flex items-center justify-center gap-3 px-6 py-3 rounded-2xl font-black text-xs shadow-xl transition-all duration-300 border-2 active:scale-95 ${
        showReport 
          ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white border-transparent' 
          : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50'
            }`}
          >
            <FileSpreadsheet size={16} />
            {showReport ? 'CLOSE ANALYTICS' : 'VISUAL ANALYTICS'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
          <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 font-black text-xs uppercase tracking-widest animate-pulse">Fetching Report Data...</p>
        </div>
      )}

      {!loading && error && (
        <div className={`mb-4 p-3 bg-red-50 text-red-600 rounded-xl flex items-center gap-2 text-xs font-bold border border-red-100 animate-in shake-1 ${showFilters ? 'mt-4' : 'mt-16'}`}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!loading && reportData && (
        <div className={`space-y-4 ${!error ? 'mt-4' : ''}`}>
          {/* High Density KPI Summary - Only shown in Table View */}
          {!showReport && (
            <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 animate-in zoom-in-95 duration-500">
              <Card title="Total Customers" value={reportData.metrics.totalCustomers} icon={<Users size={18} />} color="blue" />
              <Card title="Total Revenue" value={`₹${reportData.metrics.totalBillingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<IndianRupee size={18} />} color="green" />
              <Card title="With Mobile" value={reportData.metrics.withMobile} icon={<Smartphone size={18} />} color="emerald" />
              <Card title="Without Mobile" value={reportData.metrics.withoutMobile} icon={<PhoneOff size={18} />} color="amber" />
              <Card title="Bills < ₹100" value={reportData.metrics.below100} icon={<ArrowDownCircle size={18} />} color="slate" />
              <Card title="Bills > ₹100" value={reportData.metrics.above100} icon={<ArrowUpCircle size={18} />} color="indigo" />
              <Card title="Redeem Points" value={reportData.metrics.redeemPointsCount ?? reportData.metrics.redeemPoints} icon={<Gift size={18} />} color="rose" />
            </section>
          )}

          {!showReport ? (
            /* Settlement Summary Table View */
            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
              <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-4 bg-blue-600 rounded-full"></div>
                  <h3 className="font-black text-gray-900 text-sm tracking-tight uppercase">Settlement Summary</h3>
                </div>
                <div className="flex gap-2">
                  <div className="flex bg-white rounded-xl border border-gray-100 p-0.5 shadow-sm">
                    <button 
                      onClick={() => handleExport('pdf', true)}
                      className="flex items-center gap-1.5 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all text-[10px] font-black uppercase tracking-widest active:scale-95 border-r border-gray-100"
                      title="View PDF"
                    >
                      <Search size={12} />
                      View PDF
                    </button>
                    <button 
                      onClick={() => handleExport('pdf')}
                      className="flex items-center gap-1.5 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all text-[10px] font-black uppercase tracking-widest active:scale-95"
                      title="Download PDF"
                    >
                      <FileDown size={14} />
                      PDF
                    </button>
                  </div>
                  
                  <div className="flex bg-white rounded-xl border border-gray-100 p-0.5 shadow-sm">
                    <button 
                      onClick={() => handleExport('excel')}
                      className="flex items-center gap-1.5 text-emerald-600 px-4 py-2 rounded-lg hover:bg-emerald-50 transition-all text-[10px] font-black uppercase tracking-widest active:scale-95"
                    >
                      <FileSpreadsheet size={14} />
                      Excel
                    </button>
                  </div>
                </div>
              </div>
              <div className={`overflow-x-auto overflow-y-auto ${showFilters ? 'max-h-[60vh]' : 'max-h-[80vh]'} custom-scrollbar transition-all duration-300`}>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50/80 text-gray-500 text-[10px] font-black uppercase tracking-widest sticky top-0 z-10 backdrop-blur-md">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-4 border-r border-gray-200">Entry No</th>
                      <th className="px-3 py-4 border-r border-gray-200">Entry Date</th>
                      <th className="px-3 py-4 border-r border-gray-200">Cashier</th>
                      <th className="px-3 py-4 border-r border-gray-200">Cash</th>
                      <th className="px-3 py-4 border-r border-gray-200">Card</th>
                      <th className="px-3 py-4 border-r border-gray-200">Cheque</th>
                      <th className="px-3 py-4 border-r border-gray-200">Others</th>
                      <th className="px-3 py-4 border-r border-gray-200">Balance</th>
                      <th className="px-3 py-4 border-r border-gray-200 font-black text-blue-600 bg-blue-50/50">Bill Amt</th>
                      <th className="px-3 py-4 border-r border-gray-200">Disc Amt</th>
                      <th className="px-3 py-4 border-r border-gray-200">Refund Amt</th>
                      <th className="px-3 py-4 border-r border-gray-200">Customer</th>
                      <th className="px-3 py-4 border-r border-gray-200">CUSMob</th>
                      <th className="px-3 py-4">GroupBillno</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px]">
                    {reportData.transactions.length > 0 ? reportData.transactions.map((t: any, idx: number) => (
                      <tr key={t._id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-blue-50/50 transition-colors`}>
                        <td className="px-3 py-2 border-r border-gray-100 font-black text-gray-900">{t.entryNo}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-500 font-bold">{formatDateUTC(t.entryDate)}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-700 font-black uppercase tracking-tighter whitespace-nowrap">{t.cashier}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right text-gray-600 font-medium">{t.cash?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right text-gray-600 font-medium">{t.card?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right text-gray-600 font-medium">{t.cheque?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right text-gray-600 font-medium">{t.others?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right font-black text-red-500 bg-red-50/20">{t.balance?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right font-black text-blue-700 bg-blue-50/30">{t.billAmt?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right text-emerald-600 font-bold">{t.discAmt?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-right text-amber-600 font-bold">{t.refundAmt?.toFixed(2) || '0.00'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-900 font-black tracking-tight">{t.customer || ''}</td>
                        <td className="px-3 py-2 border-r border-gray-100 text-gray-500 font-mono tracking-tighter">{t.cusMob || ''}</td>
                        <td className="px-3 py-2 text-gray-400 font-medium">{t.groupBillNo || ''}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={14} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <AlertCircle size={32} className="text-gray-300" />
                            <p className="text-gray-500 font-black text-sm uppercase tracking-widest">No matching records found</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            /* Visual Analytics View */
            <div className="animate-in slide-in-from-bottom-6 duration-700 space-y-6 pb-8">
              {/* Analytics Export Bar */}
              <div className="flex justify-between items-center bg-white/80 backdrop-blur-md p-3 rounded-2xl shadow-sm border border-gray-100 sticky top-16 lg:top-14 z-20">
                <div className="flex items-center gap-2 pl-2">
                  <div className="w-2 h-4 bg-gradient-to-b from-indigo-500 to-blue-600 rounded-full shadow-lg shadow-blue-200"></div>
                  <h3 className="font-black text-gray-900 text-xs tracking-tight uppercase">Performance Analytics</h3>
                </div>
                <div className="flex gap-2">
                  <div className="flex bg-gray-50/50 rounded-xl border border-gray-100 p-0.5 shadow-inner">
                    <button 
                      onClick={() => handleExportAnalytics('pdf', true)}
                      className="flex items-center gap-1.5 text-red-600 px-3 py-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-[10px] font-black uppercase tracking-widest active:scale-95 border-r border-gray-200"
                    >
                      <Search size={12} />
                      Preview
                    </button>
                    <button 
                      onClick={() => handleExportAnalytics('pdf')}
                      className="flex items-center gap-1.5 text-red-600 px-3 py-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all text-[10px] font-black uppercase tracking-widest active:scale-95"
                    >
                      <FileDown size={14} />
                      PDF
                    </button>
                  </div>
                  
                  <div className="flex bg-gray-50/50 rounded-xl border border-gray-100 p-0.5 shadow-inner">
                    <button 
                      onClick={() => handleExportAnalytics('excel')}
                      className="flex items-center gap-1.5 text-emerald-600 px-4 py-2 rounded-lg hover:bg-white hover:shadow-sm transition-all text-[10px] font-black uppercase tracking-widest active:scale-95"
                    >
                      <FileSpreadsheet size={14} />
                      Excel
                    </button>
                  </div>
                </div>
              </div>

              {/* Enhanced Quick Summary Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-orange-600 to-orange-700 p-5 rounded-3xl shadow-xl shadow-blue-100 text-white relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <div className="relative z-10">
                    <p className="text-orange-100 text-[10px] font-black uppercase tracking-widest mb-1">Gross Revenue</p>
                    <h4 className="text-3xl font-black">₹{reportData.metrics.totalBillingAmount.toLocaleString()}</h4>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold bg-white/10 w-fit px-2 py-1 rounded-lg">
                      <ChevronUp size={12} />
                      <span>LIVE PERFORMANCE</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 p-5 rounded-3xl shadow-xl shadow-indigo-100 text-white relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <div className="relative z-10">
                    <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1">Total Orders</p>
                    <h4 className="text-3xl font-black">{reportData.metrics.totalCustomers}</h4>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold bg-white/10 w-fit px-2 py-1 rounded-lg">
                      <Users size={12} />
                      <span>{reportData.metrics.withMobile} MOBILES</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 rounded-3xl shadow-xl shadow-emerald-100 text-white relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                  <div className="relative z-10">
                    <p className="text-emerald-100 text-[10px] font-black uppercase tracking-widest mb-1">Avg Bill Value</p>
                    <h4 className="text-3xl font-black">₹{Math.round(reportData.metrics.totalBillingAmount / (reportData.metrics.totalCustomers || 1)).toLocaleString()}</h4>
                    <div className="mt-4 flex items-center gap-2 text-[10px] font-bold bg-white/10 w-fit px-2 py-1 rounded-lg">
                      <ArrowUpCircle size={12} />
                      <span>{reportData.metrics.above100} HIGH VALUE</span>
                    </div>
                  </div>
                </div>
              </div>

              <section className="grid grid-cols-1 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-gray-100/50 border border-gray-50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8">
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Revenue</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col mb-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-1.5 h-6 bg-gradient-to-b from-orange-500 to-orange-400 rounded-full"></div>
                      <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Revenue Trend Analysis</h3>
                    </div>
                    <p className="text-gray-400 text-xs font-bold pl-4 uppercase tracking-widest">Daily sales performance over selected period</p>
                  </div>

                  <div className="h-[450px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={reportData.dailyTrend}>
                        <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="_id" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}}
                          tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
                        />
                        <Tooltip 
                          contentStyle={{
                            borderRadius: '24px', 
                            border: 'none', 
                            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', 
                            padding: '16px',
                            background: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(8px)'
                          }}
                          itemStyle={{
                            fontSize: '14px',
                            fontWeight: '900',
                            color: '#1e293b'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="sales" 
                          stroke="#f97316" 
                          strokeWidth={4} 
                          fillOpacity={1} 
                          fill="url(#colorSales)"
                          animationDuration={2000}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>

              {/* Bill with Mobile & Distribution Grid */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bar Chart: Bill Distribution */}
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-gray-100/50 border border-gray-50 group transition-all duration-500 hover:shadow-2xl hover:shadow-blue-100/50">
                  <div className="flex items-center gap-3 mb-8">
                      <div className="w-1.5 h-6 bg-gradient-to-b from-orange-500 to-orange-400 rounded-full"></div>
                    <div>
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Bill Distribution</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Bills Above vs Below ₹100</p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} />
                        <Tooltip 
                          cursor={{fill: '#f8fafc'}} 
                          contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px'}} 
                        />
                        <Bar dataKey="value" fill="#f97316" radius={[10, 10, 0, 0]} barSize={40}>
                          {barData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : '#f97316'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Pie Chart: Mobile Number Status */}
                <div className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-gray-100/50 border border-gray-50 group transition-all duration-500 hover:shadow-2xl hover:shadow-indigo-100/50">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-1.5 h-6 bg-gradient-to-b from-indigo-500 to-violet-600 rounded-full"></div>
                    <div>
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Mobile Contact Status</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customers with mobile numbers</p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={pieData} 
                          cx="50%" 
                          cy="50%" 
                          innerRadius={60} 
                          outerRadius={85} 
                          paddingAngle={10} 
                          dataKey="value" 
                          stroke="none"
                        >
                          {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip 
                          contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px'}} 
                        />
                        <Legend 
                          verticalAlign="bottom" 
                          height={36} 
                          iconType="circle" 
                          wrapperStyle={{fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.1em'}} 
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      )}
  </div>
);
};

interface CardProps {
title: string;
value: string | number;
icon: React.ReactNode;
color: string;
}

const Card: React.FC<CardProps> = ({ title, value, icon, color }) => {
const colorMap: any = {
  blue: 'bg-blue-600 shadow-blue-200',
  green: 'bg-emerald-600 shadow-emerald-200',
  emerald: 'bg-emerald-500 shadow-emerald-100',
  amber: 'bg-amber-500 shadow-amber-100',
  slate: 'bg-slate-700 shadow-slate-200',
  indigo: 'bg-indigo-600 shadow-indigo-200',
  rose: 'bg-rose-500 shadow-rose-100',
};

return (
  <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden relative">
    <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-5 transition-transform duration-500 group-hover:scale-150 ${colorMap[color].split(' ')[0]}`}></div>
      <div className="flex items-center gap-3 relative z-10">
      <div className={`p-2 rounded-xl text-white shadow-lg ${colorMap[color]}`}>
        {icon}
      </div>
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
      <h4 className="text-base md:text-lg lg:text-xl font-black text-gray-900 mt-0.5 tracking-tight whitespace-nowrap">{value}</h4>
    </div>
    </div>
  </div>
);
};

export default Dashboard;
