// utils/currencyFormat.ts
export const formatIndianCurrency = (value: string | number): string => {
    if (!value) return "";
    const num = parseFloat(value.toString().replace(/[^0-9.-]+/g, ""));
    if (isNaN(num)) return "";
    return num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  
  export const parseIndianCurrency = (value: string): string => {
    if (!value) return "";
    // Remove all non-numeric characters except decimal point
    const cleanedValue = value.replace(/[^0-9.-]+/g, "");
    const num = parseFloat(cleanedValue);
    return isNaN(num) ? "" : num.toString();
  };