export type InitialsApi = {
    getInitials: (fullName?: string) => string;
};

function getInitial(name: string): string {
    return Array.from(name)[0] ?? '';
}

/** Leading titles skipped so "Dr. Alan Turing" gives "AT", not "DT". */
const HONORIFIC = /^(dr|prof|mr|mrs|ms|mx|engr|atty|fr|sr|sis|br|rev|hon)\.?$/i;

export function getInitials(fullName?: string): string {
    if (!fullName) {
        return '';
    }

    const all = fullName.trim().split(/\s+/u).filter(Boolean);
    const withoutTitles = all.filter((part, index) => index >= all.length - 1 || !HONORIFIC.test(part));
    const names = withoutTitles.length > 0 ? withoutTitles : all;

    if (names.length === 0) {
        return '';
    }

    if (names.length === 1) {
        return getInitial(names[0]).toUpperCase();
    }

    return `${getInitial(names[0])}${getInitial(names[names.length - 1])}`.toUpperCase();
}

export function initialsApi(): InitialsApi {
    return { getInitials };
}
