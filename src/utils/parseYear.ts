// A small utility to safely extract a year from various date string formats.
export const parseYear = (dateValue: any): number | null => {
    if (typeof dateValue === 'number' && dateValue > 1900 && dateValue < 2100) {
        return dateValue;
    }
    if (typeof dateValue === 'string') {
        const yearMatch = dateValue.match(/\d{4}/); // Find the first 4-digit number
        if (yearMatch) {
            return parseInt(yearMatch[0], 10);
        }
    }
    return null;
};

/**
 * Tries to parse a string into a valid Date object.
 * Returns null if the string is invalid, a placeholder, or cannot be parsed.
 * @param dateString The date string to parse.
 * @returns A Date object or null.
 */
export const parseDate = (dateString: any): Date | null => {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }
    // Reject common placeholders
    if (dateString.toUpperCase().includes('YYYY')) {
        return null;
    }
    const date = new Date(dateString);
    // Check if the parsed date is valid
    if (isNaN(date.getTime())) {
        return null;
    }
    return date;
};
