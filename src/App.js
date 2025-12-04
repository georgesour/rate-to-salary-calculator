import "./styles.css";
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Settings, Calculator } from 'lucide-react';

const Card = ({ children, className = "" }) => (
	<div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
		{children}
	</div>
);

const Input = ({ value, onChange, onBlur, onFocus, className = "", type = "text", ...props }) => (
	<input
		type={type}
		value={value}
		onChange={onChange}
		onBlur={onBlur}
		onFocus={onFocus}
		className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-1 transition-colors ${className}`}
		{...props}
	/>
);

const SalaryComparator = () => {
	// --- Configuration State ---
	const [config, setConfig] = useState({
		usdPln: 3.65,
		eurUsd: 1.16,
		workingDaysInYear: 251, // Standard average
		vacationDays: 27, // User specified
		hoursPerDay: 8,
	});

	const [showSettings, setShowSettings] = useState(false);

	// --- Data State ---
	// Rows now store a single "Source of Truth": 'yearlyPln'.
	// This represents the Total Yearly Effective Income in PLN.
	// All other columns are derived from this value.
	const [rows, setRows] = useState([
		{ id: 1, yearlyPln: 201600 }, // Equiv to ~1000 PLN/day or ~125 hourly roughly
		{ id: 2, yearlyPln: 180000 }, // Equiv to 15k Monthly
		{ id: 3, yearlyPln: 294000 }, // Higher bracket
	]);

	// --- Helpers ---

	// Calculate billable hours in a year for hourly contractors (B2B)
	const getBillableHoursYearly = useCallback(() => {
		const billableDays = config.workingDaysInYear - config.vacationDays;
		return billableDays * config.hoursPerDay;
	}, [config]);

	// Currency Conversion
	const getExchangeRate = useCallback((from, to) => {
		if (from === to) return 1;

		// Convert everything to PLN first (Base)
		let toPln = 1;
		if (from === 'USD') toPln = config.usdPln;
		if (from === 'EUR') toPln = config.eurUsd * config.usdPln;

		// Convert PLN to Target
		if (to === 'PLN') return toPln;
		if (to === 'USD') return toPln / config.usdPln;
		if (to === 'EUR') return toPln / (config.eurUsd * config.usdPln);

		return 1;
	}, [config]);

	// --- Updates ---

	const updateRowYearlyPLN = (id, newYearlyPLN) => {
		setRows(prev => prev.map(r => r.id === id ? { ...r, yearlyPln: newYearlyPLN } : r));
	};

	const handleValueChange = (id, columnType, columnCurrency, newValueStr) => {
		// Remove non-numeric chars except dot
		const cleanVal = newValueStr.replace(/[^0-9.]/g, '');
		const newValue = parseFloat(cleanVal);

		if (isNaN(newValue)) return;

		// Determine the new Yearly PLN based on which column was edited
		let newYearlyPln = 0;

		// 1. Convert input value to PLN
		const rateToPLN = getExchangeRate(columnCurrency, 'PLN');
		const valInPLN = newValue * rateToPLN;

		// 2. Extrapolate to Year based on column type
		if (columnType === 'hourly') {
			// User edited Hourly Rate -> Yearly = Rate * Billable Hours
			newYearlyPln = valInPLN * getBillableHoursYearly();
		} else if (columnType === 'monthly') {
			// User edited Monthly Pay -> Yearly = Pay * 12
			newYearlyPln = valInPLN * 12;
		} else if (columnType === 'yearly') {
			// User edited Yearly Total -> Yearly = Value
			newYearlyPln = valInPLN;
		}

		updateRowYearlyPLN(id, newYearlyPln);
	};

	const addNewRow = () => {
		setRows([...rows, {
			id: Date.now(),
			yearlyPln: 0
		}]);
	};

	const removeRow = (id) => {
		setRows(rows.filter(r => r.id !== id));
	};

	// --- Render Helpers ---

	const formatNumber = (num) => {
		if (!num && num !== 0) return '';
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(num);
	};

	// Helper to render a cell
	const Cell = ({ row, type, currency, isBold = false, bgClass = "" }) => {

		let calculatedValue = 0;
		const yearlyPln = row.yearlyPln;
		const exchangeRate = getExchangeRate('PLN', currency); // Rate to convert PLN -> Target

		// Convert Yearly PLN to Target Currency Yearly
		const yearlyInTarget = yearlyPln * exchangeRate;

		// Calculate specific column value
		if (type === 'hourly') {
			calculatedValue = yearlyInTarget / getBillableHoursYearly();
		} else if (type === 'monthly') {
			calculatedValue = yearlyInTarget / 12;
		} else if (type === 'yearly') {
			calculatedValue = yearlyInTarget;
		}

		const displayString = calculatedValue === 0 ? '' : formatNumber(calculatedValue);

		// --- Interaction State ---
		const [localValue, setLocalValue] = useState(displayString);
		const [isFocused, setIsFocused] = useState(false);

		// Sync local value with calculated value whenever the calculation changes
		useEffect(() => {
			if (!isFocused) {
				setLocalValue(displayString);
			}
		}, [displayString, isFocused]);

		const onBlur = () => {
			setIsFocused(false);
			handleValueChange(row.id, type, currency, localValue);
		};

		return (
			<div className="relative group h-full">
				<Input
					value={localValue}
					id={`${row.id}-${type}-${currency}`}
					onChange={(e) => setLocalValue(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={onBlur}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.target.blur();
						}
					}}
					className={`text-right w-full h-full ${bgClass} ${isBold ? 'font-bold text-gray-900' : 'text-gray-600'}`}
				/>
				<span className="absolute left-1 top-1 text-[10px] text-gray-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
          {currency}
        </span>
			</div>
		);
	};

	return (
		<div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
			<div className="max-w-7xl mx-auto space-y-6">

				{/* Header */}
				<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
					<div>
						<h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
							<Calculator className="w-6 h-6 text-blue-600" />
							Salary Comparator Poland
						</h1>
						<p className="text-sm text-gray-500 mt-1">
							Universal Converter: B2B Hourly vs Monthly Employment (adjusted for {config.vacationDays} unpaid days).
						</p>
					</div>
					<button
						onClick={() => setShowSettings(!showSettings)}
						className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50 text-gray-700 shadow-sm transition-colors"
					>
						<Settings className="w-4 h-4" />
						{showSettings ? 'Hide Settings' : 'Settings & Rates'}
					</button>
				</div>

				{/* Settings Panel */}
				{showSettings && (
					<Card className="p-6 bg-blue-50/50 border-blue-100 animate-in fade-in slide-in-from-top-4 duration-300">
						<h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Configuration</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

							<div className="space-y-2">
								<label className="text-xs font-medium text-gray-500 block">USD to PLN</label>
								<div className="flex items-center bg-white border border-gray-200 rounded px-2">
									<span className="text-gray-400 text-sm">$1 =</span>
									<input
										type="number"
										step="0.01"
										value={config.usdPln}
										onChange={(e) => setConfig({...config, usdPln: parseFloat(e.target.value) || 0})}
										className="w-full p-2 outline-none text-sm font-mono"
									/>
									<span className="text-gray-400 text-sm">PLN</span>
								</div>
							</div>

							<div className="space-y-2">
								<label className="text-xs font-medium text-gray-500 block">EUR to USD</label>
								<div className="flex items-center bg-white border border-gray-200 rounded px-2">
									<span className="text-gray-400 text-sm">€1 =</span>
									<input
										type="number"
										step="0.01"
										value={config.eurUsd}
										onChange={(e) => setConfig({...config, eurUsd: parseFloat(e.target.value) || 0})}
										className="w-full p-2 outline-none text-sm font-mono"
									/>
									<span className="text-gray-400 text-sm">USD</span>
								</div>
							</div>

							<div className="space-y-2">
								<label className="text-xs font-medium text-gray-500 block">Unpaid Vacation Days (B2B)</label>
								<input
									type="number"
									value={config.vacationDays}
									onChange={(e) => setConfig({...config, vacationDays: parseInt(e.target.value) || 0})}
									className="w-full p-2 border border-gray-200 rounded bg-white outline-none text-sm focus:border-blue-500"
								/>
							</div>

							<div className="space-y-2">
								<label className="text-xs font-medium text-gray-500 block">Working Days / Year</label>
								<input
									type="number"
									value={config.workingDaysInYear}
									onChange={(e) => setConfig({...config, workingDaysInYear: parseInt(e.target.value) || 0})}
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

							{/* Hourly Columns */}
							<th className="px-4 py-3 border-b border-r text-right bg-blue-50/50 w-32">
								Hourly Rate<br/><span className="text-[10px] text-gray-400">PLN (B2B)</span>
							</th>
							<th className="px-4 py-3 border-b border-r text-right bg-blue-50/30 w-32">
								Hourly Rate<br/><span className="text-[10px] text-gray-400">USD</span>
							</th>

							{/* Monthly Columns */}
							<th className="px-4 py-3 border-b border-r text-right bg-yellow-50/50 w-32">
								Monthly Pay<br/><span className="text-[10px] text-gray-400">PLN (Job)</span>
							</th>
							<th className="px-4 py-3 border-b border-r text-right bg-yellow-50/30 w-32">
								Monthly Pay<br/><span className="text-[10px] text-gray-400">USD</span>
							</th>

							{/* Yearly Columns */}
							<th className="px-4 py-3 border-b border-r text-right w-32">Yearly<br/><span className="text-[10px] text-gray-400">PLN</span></th>
							<th className="px-4 py-3 border-b border-r text-right w-32">Yearly<br/><span className="text-[10px] text-gray-400">USD</span></th>
							<th className="px-4 py-3 border-b text-right w-32">Yearly<br/><span className="text-[10px] text-gray-400">EUR</span></th>

							<th className="px-4 py-3 border-b w-12"></th>
						</tr>
						</thead>
						<tbody className="divide-y divide-gray-100">
						{rows.map((row, index) => (
							<tr key={row.id} className="hover:bg-gray-50 group transition-colors">
								<td className="px-2 py-3 border-r text-center text-gray-400 text-xs">
									{index + 1}
								</td>

								{/* Hourly PLN (Raw Rate) */}
								<td className="px-0 py-0 border-r bg-blue-50/20">
									<Cell row={row} type="hourly" currency="PLN" isBold bgClass="px-4 py-2" />
								</td>
								{/* Hourly USD */}
								<td className="px-0 py-0 border-r bg-blue-50/10">
									<Cell row={row} type="hourly" currency="USD" bgClass="px-4 py-2" />
								</td>

								{/* Monthly PLN */}
								<td className="px-0 py-0 border-r bg-yellow-50/20">
									<Cell row={row} type="monthly" currency="PLN" isBold bgClass="px-4 py-2" />
								</td>
								{/* Monthly USD */}
								<td className="px-0 py-0 border-r bg-yellow-50/10">
									<Cell row={row} type="monthly" currency="USD" bgClass="px-4 py-2" />
								</td>

								{/* Yearly Totals */}
								<td className="px-0 py-0 border-r">
									<Cell row={row} type="yearly" currency="PLN" bgClass="px-4 py-2" />
								</td>
								<td className="px-0 py-0 border-r">
									<Cell row={row} type="yearly" currency="USD" bgClass="px-4 py-2" />
								</td>
								<td className="px-0 py-0">
									<Cell row={row} type="yearly" currency="EUR" bgClass="px-4 py-2" />
								</td>

								{/* Actions */}
								<td className="px-2 py-2 text-center">
									<button
										onClick={() => removeRow(row.id)}
										className="text-gray-300 hover:text-red-500 transition-colors p-1"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</td>
							</tr>
						))}

						{/* Add Row Button */}
						<tr>
							<td colSpan="9" className="p-2 border-t border-gray-100">
								<button
									onClick={addNewRow}
									className="flex items-center gap-2 text-blue-600 font-medium text-sm px-4 py-2 hover:bg-blue-50 rounded-md transition-colors w-full md:w-auto"
								>
									<Plus className="w-4 h-4" />
									Add Comparison Row
								</button>
							</td>
						</tr>
						</tbody>
					</table>
				</div>

				{/* Legend / Info */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
					<Card className="p-4 bg-gray-50">
						<h4 className="font-semibold text-gray-700 mb-2">Equivalent Calculator Logic</h4>
						<div className="space-y-2 text-xs">
							<p>This table calculates the exact monetary equivalent between an Hourly Rate (with unpaid vacations) and a Fixed Monthly Salary.</p>
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
							<li><strong>Enter your known value</strong> in any column.</li>
							<li>Example: If you know your B2B Hourly Rate is 100 PLN, enter it in the first column. The "Monthly Pay" column will show the equivalent Employment salary.</li>
							<li>Change exchange rates in <strong>Settings</strong>.</li>
						</ul>
					</Card>
				</div>

			</div>
		</div>
	);
};

export default SalaryComparator;