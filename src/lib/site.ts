/** Static organisation facts used by layouts, SEO and structured data. */
export const SITE = {
    name: 'San Isidro College',
    shortName: 'SIC',
    motto: 'Ora et Labora',
    tagline: 'A private Catholic educational institution in Malaybalay City, Bukidnon, founded in 1949.',
    description:
        'San Isidro College is a private Catholic college in Malaybalay City, Bukidnon, Philippines. Established in 1949 by Fr. Joseph Reith, SJ, offering CHED-recognized programs, basic education and scholarships.',
    foundingDate: '1949',
    founder: 'Fr. Joseph Reith, SJ',
    locale: 'en_PH',
    lang: 'en',
    logo: '/sic-seal.png',
    /** Replace with a 1200×630 campus photo once the college supplies imagery. */
    defaultOgImage: '/sic-seal.png',
    address: {
        streetAddress: 'Impalambong',
        addressLocality: 'Malaybalay City',
        addressRegion: 'Bukidnon',
        postalCode: '8700',
        addressCountry: 'PH',
    },
    email: 'info@sic.edu.ph',
    telephone: '(088) 813-5541',
    telephoneE164: '+63888135541',
    sameAs: ['https://www.facebook.com/sanisidrocollegeofficial', 'https://www.tiktok.com/@sanisidrocollege'],
} as const;
