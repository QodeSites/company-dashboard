import React, { useState } from "react";

interface CheckboxSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

const ClientSelectCheckbox: React.FC<CheckboxSelectProps> = ({
  label,
  options,
  selected,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleDropdown = () => setIsOpen(!isOpen);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const handleSelectAll = () => {
    onChange(options);
  };

  const handleDeselectAll = () => {
    onChange([]);
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>

      <div className="relative">
        <button
          type="button"
          className="w-full flex justify-between items-center border rounded px-3 py-2 bg-white dark:bg-gray-800 dark:border-gray-700"
          onClick={toggleDropdown}
        >
          <span className="text-sm text-gray-700 dark:text-white">
            {selected.length === 0 ? "Select Clients" : `${selected.length} selected`}
          </span>
          <svg
            className={`w-4 h-4 transform transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-900 border rounded shadow-sm p-2 space-y-1">
            <div className="flex justify-between mb-1 text-sm text-blue-600">
              <button onClick={handleSelectAll} className="hover:underline">Select All</button>
              <button onClick={handleDeselectAll} className="hover:underline">Deselect All</button>
            </div>
            {options.map((option) => (
              <label key={option} className="flex items-center space-x-2 text-sm text-gray-700 dark:text-white">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => handleSelect(option)}
                  className="form-checkbox"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientSelectCheckbox;
