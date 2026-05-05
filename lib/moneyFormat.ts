type CompactOptions = {
    decimals?: number;
    fallback?: string;
  };
  
  export const formatCompact = (
    input: number | string | null | undefined,
    options: CompactOptions = {}
  ): string => {
    const { decimals = 1, fallback = '0' } = options;
  
    if (input === null || input === undefined) return fallback;
  
    // Normalize input
    const raw = typeof input === 'string'
      ? input.replace(/,/g, '').trim()
      : input;
  
    const num = typeof raw === 'number' ? raw : Number(raw);
  
    if (!isFinite(num)) return fallback;
  
    const isNegative = num < 0;
    const abs = Math.abs(num);
  
    const units = [
      { value: 1e12, symbol: 'T' },
      { value: 1e9, symbol: 'B' },
      { value: 1e6, symbol: 'M' },
      { value: 1e3, symbol: 'K' },
    ];
  
    for (const unit of units) {
      if (abs >= unit.value) {
        let formatted = (abs / unit.value).toFixed(decimals);
  
        // Handle rounding overflow (e.g., 999.9K → 1M)
        if (Number(formatted) >= 1000 && unit !== units[0]) {
          const nextUnit = units[units.indexOf(unit) - 1];
          formatted = (abs / nextUnit.value).toFixed(decimals);
          return `${isNegative ? '-' : ''}${stripZeros(formatted)}${nextUnit.symbol}`;
        }
  
        return `${isNegative ? '-' : ''}${stripZeros(formatted)}${unit.symbol}`;
      }
    }
  
    return `${isNegative ? '-' : ''}${stripZeros(abs.toFixed(decimals))}`;
  };
  
  // helper
  const stripZeros = (val: string) =>
    val.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');