import React, {useState, useEffect, useCallback, useRef} from 'react';
import {Plus, Trash2, Settings, Calculator, RotateCcw, AlertTriangle, Github, RefreshCw} from 'lucide-react';

// Constants
const STORAGE_KEYS = {
    CONFIG: 'salary_config',
    ROWS: 'salary_rows',
    RATES_UPDATED: 'rates_last_updated',
};

const DEFAULT_CONFIG = {
    usdPln: 3.65,
    eurUsd: 1.16,
    workingDaysInYear: 251,
    vacationDays: 27,
    hoursPerDay: 8,
};

const DEFAULT_ROWS = [
    {id: 1, companyName: 'Company A', yearlyPln: 201600},
    {id: 2, companyName: 'Company B', yearlyPln: 180000},
    {id: 3, companyName: '', yearlyPln: 294000},
];

const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const HOURLY_ROUNDING_STEP = 0.10;
const MONTHS_PER_YEAR = 12;

// Helper functions
const cleanNumericValue = (str) => str.replace(/[^0-9.]/g, '');

const roundToCents = (value) => Math.round(value * 10) / 10;

const formatCurrency = (value, decimals = 0) => {
    if (value === 0) return '';
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
};

const loadFromStorage = (key, defaultValue) => {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
        console.error(`Error loading ${key} from storage:`, error);
        return defaultValue;
    }
};

// Components
const Card = ({children, className = ""}) => (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
        {children}
    </div>
);

const Input = React.forwardRef(({value, onChange, onBlur, onFocus, className = "", type = "text", ...props}, ref) => (
    <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-1 transition-colors ${className}`}
        {...props}
    />
));

const Cell = React.memo(({
    row,
    type,
    currency,
    exchangeRate,
    billableHours,
    onUpdate,
    isBold = false,
    bgClass = ""
}) => {
    const isUsdOrEurHourly = (currency === 'USD' || currency === 'EUR') && type === 'hourly';
    
    // Calculate display value
    const yearlyInTarget = row.yearlyPln * exchangeRate;
    let calculatedValue = 0;
    
    if (type === 'hourly') {
        calculatedValue = yearlyInTarget / billableHours;
    } else if (type === 'monthly') {
        calculatedValue = yearlyInTarget / MONTHS_PER_YEAR;
    } else if (type === 'yearly') {
        calculatedValue = yearlyInTarget;
    }
    
    // Round hourly USD/EUR to 10 cents
    if (isUsdOrEurHourly && calculatedValue !== 0) {
        calculatedValue = roundToCents(calculatedValue);
    }
    
    const displayString = formatCurrency(calculatedValue, isUsdOrEurHourly ? 1 : 0);
    
    // Local state for editing
    const [localValue, setLocalValue] = useState(displayString);
    const [isFocused, setIsFocused] = useState(false);
    const initialValueRef = useRef(displayString);
    
    // Sync with props when not editing
    useEffect(() => {
        if (!isFocused) {
            setLocalValue(displayString);
            initialValueRef.current = displayString;
        }
    }, [displayString, isFocused]);
    
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
            return;
        }
        
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            
            const cleanValue = cleanNumericValue(localValue);
            const currentValue = parseFloat(cleanValue) || 0;
            const step = isUsdOrEurHourly ? HOURLY_ROUNDING_STEP : 1;
            
            let newValue = e.key === 'ArrowUp'
                ? currentValue + step
                : Math.max(0, currentValue - step);
            
            if (isUsdOrEurHourly) {
                newValue = roundToCents(newValue);
            }
            
            const newValueStr = formatCurrency(newValue, isUsdOrEurHourly ? 1 : 0);
            setLocalValue(newValueStr);
            onUpdate(row.id, type, currency, newValueStr);
        }
    };
    
    const handleFocus = () => {
        setIsFocused(true);
        initialValueRef.current = localValue;
    };
    
    const handleBlur = () => {
        setIsFocused(false);
        const cleanLocalValue = cleanNumericValue(localValue);
        const cleanInitialValue = cleanNumericValue(initialValueRef.current);
        
        if (cleanLocalValue !== cleanInitialValue) {
            onUpdate(row.id, type, currency, localValue);
        }
    };
    
    return (
        <div className="relative group h-full">
            <Input
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={`text-right w-full h-full ${bgClass} ${isBold ? 'font-bold text-gray-900' : 'text-gray-600'}`}
            />
            <span className="absolute left-1 top-1 text-[10px] text-gray-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {currency}
            </span>
        </div>
    );
});

const SalaryComparator = () => {
    // State
    const [config, setConfig] = useState(() => loadFromStorage(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG));
    const [rows, setRows] = useState(() => loadFromStorage(STORAGE_KEYS.ROWS, DEFAULT_ROWS));
    const [showSettings, setShowSettings] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [ratesLoading, setRatesLoading] = useState(false);
    const [ratesError, setRatesError] = useState(null);
    const [ratesLastUpdated, setRatesLastUpdated] = useState(null);
    
    // Persistence
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEYS.ROWS, JSON.stringify(rows));
            localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }, [rows, config]);
    
    // Exchange rate fetching
    const fetchExchangeRates = useCallback(async () => {
        setRatesLoading(true);
        setRatesError(null);
        
        try {
            const response = await fetch(EXCHANGE_RATE_API);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.rates?.PLN && data.rates?.EUR) {
                const usdPln = data.rates.PLN;
                const usdEur = data.rates.EUR;
                const eurUsd = roundToCents(1 / usdEur);
                
                setConfig(prev => ({
                    ...prev,
                    usdPln,
                    eurUsd
                }));
                
                const updateTime = new Date().toISOString();
                setRatesLastUpdated(updateTime);
                localStorage.setItem(STORAGE_KEYS.RATES_UPDATED, updateTime);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error fetching exchange rates:', error);
            setRatesError('Failed to load exchange rates. Using cached or default values.');
        } finally {
            setRatesLoading(false);
        }
    }, []);
    
    // Load rates on mount
    useEffect(() => {
        const cachedUpdateTime = localStorage.getItem(STORAGE_KEYS.RATES_UPDATED);
        const now = new Date();
        const cacheExpiry = new Date(now.getTime() - CACHE_DURATION_MS);
        
        if (!cachedUpdateTime || new Date(cachedUpdateTime) < cacheExpiry) {
            fetchExchangeRates();
        } else {
            setRatesLastUpdated(cachedUpdateTime);
        }
    }, [fetchExchangeRates]);
    
    // Helpers
    const getBillableHoursYearly = useCallback(() => {
        const billableDays = config.workingDaysInYear - config.vacationDays;
        return billableDays * config.hoursPerDay;
    }, [config]);
    
    const getExchangeRate = useCallback((from, to) => {
        if (from === to) return 1;
        
        // Convert to PLN first
        let toPln = 1;
        if (from === 'USD') toPln = config.usdPln;
        if (from === 'EUR') toPln = config.eurUsd * config.usdPln;
        
        // Convert PLN to target
        if (to === 'PLN') return toPln;
        if (to === 'USD') return toPln / config.usdPln;
        if (to === 'EUR') return toPln / (config.eurUsd * config.usdPln);
        
        return 1;
    }, [config]);
    
    // Handlers
    const handleReset = useCallback(() => {
        setRows(DEFAULT_ROWS);
        setConfig(DEFAULT_CONFIG);
        setShowResetConfirm(false);
    }, []);
    
    const updateRowField = useCallback((id, field, value) => {
        setRows(prev => prev.map(r => r.id === id ? {...r, [field]: value} : r));
    }, []);
    
    const handleValueChange = useCallback((id, columnType, columnCurrency, newValueStr) => {
        const cleanVal = cleanNumericValue(newValueStr);
        const newValue = parseFloat(cleanVal);
        
        if (isNaN(newValue)) return;
        
        const rateToPLN = getExchangeRate(columnCurrency, 'PLN');
        const valInPLN = newValue * rateToPLN;
        let newYearlyPln = 0;
        
        if (columnType === 'hourly') {
            newYearlyPln = valInPLN * getBillableHoursYearly();
        } else if (columnType === 'monthly') {
            newYearlyPln = valInPLN * MONTHS_PER_YEAR;
        } else if (columnType === 'yearly') {
            newYearlyPln = valInPLN;
        }
        
        updateRowField(id, 'yearlyPln', newYearlyPln);
    }, [getExchangeRate, getBillableHoursYearly, updateRowField]);
    
    const addNewRow = useCallback(() => {
        setRows(prev => [...prev, {
            id: Date.now(),
            companyName: '',
            yearlyPln: 0
        }]);
    }, []);
    
    const removeRow = useCallback((id) => {
        setRows(prev => prev.filter(r => r.id !== id));
    }, []);
    
    // Computed values
    const billableHours = getBillableHoursYearly();
    
    // Column definitions for rendering
    const columnDefinitions = [
        {type: 'hourly', currency: 'PLN', bgClass: 'bg-blue-50/20', isBold: true},
        {type: 'hourly', currency: 'USD', bgClass: 'bg-blue-50/10'},
        {type: 'hourly', currency: 'EUR', bgClass: 'bg-blue-50/5'},
        {type: 'monthly', currency: 'PLN', bgClass: 'bg-yellow-50/20', isBold: true},
        {type: 'monthly', currency: 'USD', bgClass: 'bg-yellow-50/10'},
        {type: 'monthly', currency: 'EUR', bgClass: 'bg-yellow-50/5'},
        {type: 'yearly', currency: 'PLN', bgClass: ''},
        {type: 'yearly', currency: 'USD', bgClass: ''},
        {type: 'yearly', currency: 'EUR', bgClass: ''},
    ];
    
    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Calculator className="w-6 h-6 text-blue-600"/>
                            B2B Hourly Rate Calculator
                            <a
                                href="https://github.com/georgesour/rate-to-salary-calculator"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                                aria-label="View on GitHub"
                            >
                                <Github className="w-5 h-5"/>
                            </a>
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Converts Hourly Rate to Fixed Monthly Pay and other way around. Adjusts for unpaid days ({config.vacationDays}).
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowResetConfirm(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-md text-sm hover:bg-red-50 shadow-sm transition-colors"
                        >
                            <RotateCcw className="w-4 h-4"/>
                            Reset
                        </button>
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50 text-gray-700 shadow-sm transition-colors"
                        >
                            <Settings className="w-4 h-4"/>
                            {showSettings ? 'Hide Settings' : 'Vacations & Currencies'}
                        </button>
                    </div>
                </div>
                
                {/* Settings Panel */}
                {showSettings && (
                    <Card className="p-6 bg-blue-50/50 border-blue-100 animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Configuration</h3>
                            <button
                                onClick={fetchExchangeRates}
                                disabled={ratesLoading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs hover:bg-gray-50 text-gray-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Refresh exchange rates from API"
                            >
                                <RefreshCw className={`w-3 h-3 ${ratesLoading ? 'animate-spin' : ''}`}/>
                                {ratesLoading ? 'Loading...' : 'Refresh Rates'}
                            </button>
                        </div>
                        
                        {ratesError && (
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800">
                                {ratesError}
                            </div>
                        )}
                        
                        {ratesLastUpdated && !ratesError && (
                            <div className="mb-4 text-xs text-gray-500">
                                Rates last updated: {new Date(ratesLastUpdated).toLocaleString()}
                            </div>
                        )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-500 block">
                                    USD to PLN
                                    <span className="ml-1 text-gray-400 font-normal">(auto-loaded)</span>
                                </label>
                                <div className="flex items-center bg-white border border-gray-200 rounded px-2">
                                    <span className="text-gray-400 text-sm">$1 =</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={config.usdPln}
                                        onChange={(e) => setConfig(prev => ({
                                            ...prev,
                                            usdPln: parseFloat(e.target.value) || 0
                                        }))}
                                        className="w-full p-2 outline-none text-sm font-mono"
                                    />
                                    <span className="text-gray-400 text-sm">PLN</span>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-500 block">
                                    EUR to USD
                                    <span className="ml-1 text-gray-400 font-normal">(auto-loaded)</span>
                                </label>
                                <div className="flex items-center bg-white border border-gray-200 rounded px-2">
                                    <span className="text-gray-400 text-sm">€1 =</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={roundToCents(config.eurUsd)}
                                        onChange={(e) => {
                                            const value = parseFloat(e.target.value) || 0;
                                            setConfig(prev => ({
                                                ...prev,
                                                eurUsd: roundToCents(value)
                                            }));
                                        }}
                                        onBlur={(e) => {
                                            const value = parseFloat(e.target.value) || 0;
                                            setConfig(prev => ({
                                                ...prev,
                                                eurUsd: roundToCents(value)
                                            }));
                                        }}
                                        className="w-full p-2 outline-none text-sm font-mono"
                                    />
                                    <span className="text-gray-400 text-sm">USD</span>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-500 block">Unpaid Vacation (B2B)</label>
                                <input
                                    type="number"
                                    value={config.vacationDays}
                                    onChange={(e) => setConfig(prev => ({
                                        ...prev,
                                        vacationDays: parseInt(e.target.value) || 0
                                    }))}
                                    className="w-full p-2 border border-gray-200 rounded bg-white outline-none text-sm focus:border-blue-500"
                                />
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-gray-500 block">Working Days / Year</label>
                                <input
                                    type="number"
                                    value={config.workingDaysInYear}
                                    onChange={(e) => setConfig(prev => ({
                                        ...prev,
                                        workingDaysInYear: parseInt(e.target.value) || 0
                                    }))}
                                    className="w-full p-2 border border-gray-200 rounded bg-white outline-none text-sm focus:border-blue-500"
                                />
                            </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-blue-100 text-xs text-gray-500 flex gap-4">
                            <span>Implied EUR to PLN: <span className="font-mono font-bold">{(config.eurUsd * config.usdPln).toFixed(2)}</span></span>
                            <span>Billable Hours (B2B): <span className="font-mono font-bold">{getBillableHoursYearly()}</span> / year</span>
                        </div>
                    </Card>
                )}
                
                {/* Main Spreadsheet */}
                <div className="overflow-x-auto rounded-lg shadow border border-gray-200 bg-white">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-100 text-gray-600 uppercase text-xs font-semibold tracking-wider">
                            <tr>
                                <th className="px-2 py-3 border-b border-r w-10 text-center">#</th>
                                <th className="px-4 py-3 border-b border-r w-48 text-left">Company</th>
                                
                                {/* Hourly Columns */}
                                <th className="px-4 py-3 border-b border-r text-right bg-blue-50/50 w-32">
                                    Hourly Rate<br/><span className="text-[10px] text-gray-400">PLN (B2B)</span>
                                </th>
                                <th className="px-4 py-3 border-b border-r text-right bg-blue-50/30 w-32">
                                    Hourly Rate<br/><span className="text-[10px] text-gray-400">USD</span>
                                </th>
                                <th className="px-4 py-3 border-b border-r text-right bg-blue-50/20 w-32">
                                    Hourly Rate<br/><span className="text-[10px] text-gray-400">EUR</span>
                                </th>
                                
                                {/* Monthly Columns */}
                                <th className="px-4 py-3 border-b border-r text-right bg-yellow-50/50 w-32">
                                    Monthly Pay<br/><span className="text-[10px] text-gray-400">PLN (Job)</span>
                                </th>
                                <th className="px-4 py-3 border-b border-r text-right bg-yellow-50/30 w-32">
                                    Monthly Pay<br/><span className="text-[10px] text-gray-400">USD</span>
                                </th>
                                <th className="px-4 py-3 border-b border-r text-right bg-yellow-50/20 w-32">
                                    Monthly Pay<br/><span className="text-[10px] text-gray-400">EUR</span>
                                </th>
                                
                                {/* Yearly Columns */}
                                <th className="px-4 py-3 border-b border-r text-right w-32">
                                    Yearly<br/><span className="text-[10px] text-gray-400">PLN</span>
                                </th>
                                <th className="px-4 py-3 border-b border-r text-right w-32">
                                    Yearly<br/><span className="text-[10px] text-gray-400">USD</span>
                                </th>
                                <th className="px-4 py-3 border-b text-right w-32">
                                    Yearly<br/><span className="text-[10px] text-gray-400">EUR</span>
                                </th>
                                
                                <th className="px-4 py-3 border-b w-12"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr key={row.id} className="hover:bg-gray-50 group transition-colors">
                                    <td className="px-2 py-3 border-r text-center text-gray-400 text-xs">
                                        {index + 1}
                                    </td>
                                    <td className="px-0 py-0 border-r">
                                        <Input
                                            value={row.companyName}
                                            onChange={(e) => updateRowField(row.id, 'companyName', e.target.value)}
                                            placeholder="Enter company..."
                                            className="px-4 py-2 text-left text-gray-700 placeholder-gray-300"
                                        />
                                    </td>
                                    
                                    {columnDefinitions.map((colDef, colIndex) => {
                                        const isLast = colIndex === columnDefinitions.length - 1;
                                        return (
                                            <td key={`${colDef.type}-${colDef.currency}`} className={`px-0 py-0 ${!isLast ? 'border-r' : ''} ${colDef.bgClass}`}>
                                                <Cell
                                                    row={row}
                                                    type={colDef.type}
                                                    currency={colDef.currency}
                                                    exchangeRate={getExchangeRate('PLN', colDef.currency)}
                                                    billableHours={billableHours}
                                                    onUpdate={handleValueChange}
                                                    isBold={colDef.isBold}
                                                    bgClass="px-4 py-2"
                                                />
                                            </td>
                                        );
                                    })}
                                    
                                    <td className="px-2 py-2 text-center">
                                        <button
                                            onClick={() => removeRow(row.id)}
                                            className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                            aria-label="Delete row"
                                        >
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="flex justify-end p-2 border-t border-gray-200 bg-gray-50">
                        <button
                            onClick={addNewRow}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs hover:bg-gray-50 text-gray-700 shadow-sm transition-colors"
                            aria-label="Add new row"
                        >
                            <Plus className="w-3 h-3"/>
                            Add Row
                        </button>
                    </div>
                </div>
                
                {/* Legend / Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
                    <Card className="p-4 bg-gray-50">
                        <h4 className="font-semibold text-gray-700 mb-2">Equivalent Calculator Logic</h4>
                        <div className="space-y-2 text-xs">
                            <p>This table calculates the exact monetary equivalent between an Hourly Rate (with unpaid vacations) and a Fixed Monthly Pay.</p>
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div className="bg-blue-50 p-2 rounded">
                                    <strong>Hourly (B2B)</strong>
                                    <div className="text-gray-500 mt-1">Paid for working days only.</div>
                                    <div className="font-mono mt-1">Yearly = Rate × {getBillableHoursYearly()} hrs</div>
                                </div>
                                <div className="bg-yellow-50 p-2 rounded">
                                    <strong>Monthly (Job)</strong>
                                    <div className="text-gray-500 mt-1">Paid fixed amount × 12 months.</div>
                                    <div className="font-mono mt-1">Yearly = Pay × 12</div>
                                </div>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 bg-gray-50">
                        <h4 className="font-semibold text-gray-700 mb-2">Instructions</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>Data is saved automatically</strong> to your browser.</li>
                            <li>Enter your known value in any column to see equivalents.</li>
                            <li>Change vacations and currency exchange rates in <strong>Settings</strong>.</li>
                        </ul>
                    </Card>
                </div>
            </div>
            
            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md p-6 mx-4">
                        <div className="flex items-center gap-3 text-red-600 mb-4">
                            <AlertTriangle className="w-6 h-6"/>
                            <h3 className="text-lg font-bold">Reset Application?</h3>
                        </div>
                        <p className="text-gray-600 mb-6">
                            This will erase all your current data, companies, and custom rates, returning the
                            application to its default state. This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReset}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors"
                            >
                                Yes, Reset Everything
                            </button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default SalaryComparator;
