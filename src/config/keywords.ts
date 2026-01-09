/**
 * Tech keywords configuration for article filtering
 */

export const TECH_KEYWORDS = {
  companies: [
    // US Big Tech
    'Apple',
    'Microsoft',
    'Google',
    'Alphabet',
    'Amazon',
    'Meta',
    'Facebook',
    'NVIDIA',
    'Tesla',
    'Netflix',

    // Semiconductors
    'AMD',
    'Intel',
    'Qualcomm',
    'Broadcom',
    'TSMC',
    'ASML',
    'ARM',

    // Enterprise Tech
    'Salesforce',
    'Oracle',
    'IBM',
    'SAP',
    'Adobe',
    'ServiceNow',
    'Snowflake',
    'Palantir',

    // Chinese Tech
    'Alibaba',
    'Tencent',
    'Baidu',
    'JD.com',
    'Xiaomi',
    'Huawei',

    // Other Notable
    'Spotify',
    'Uber',
    'Airbnb',
    'PayPal',
    'Block',
    'Square',
    'Shopify',
    'Zoom',
    'Slack',
    'Dropbox',
  ],

  themes: [
    // AI & ML
    'IA',
    'intelligence artificielle',
    'artificial intelligence',
    'machine learning',
    'deep learning',
    'ChatGPT',
    'GPT',
    'LLM',

    // Cloud & Infrastructure
    'cloud',
    'AWS',
    'Azure',
    'data center',
    'centre de données',

    // Hardware
    'semi-conducteurs',
    'semiconductors',
    'puces',
    'processeurs',
    'GPU',
    'CPU',

    // Security
    'cybersécurité',
    'cybersecurity',
    'ransomware',
    'hacking',

    // Emerging Tech
    'blockchain',
    'crypto',
    'bitcoin',
    'ethereum',
    '5G',
    '6G',
    'IoT',
    'metaverse',
    'réalité virtuelle',
    'réalité augmentée',
    'VR',
    'AR',

    // Software
    'SaaS',
    'logiciel',
    'software',
    'application',
  ],

  terms: [
    // General Tech
    'tech',
    'technologie',
    'technology',
    'numérique',
    'digital',

    // Industry Terms
    'startup',
    'fintech',
    'biotech',
    'cleantech',
    'edtech',
    'healthtech',

    // Market Terms
    'big tech',
    'GAFA',
    'GAFAM',
    'FAANG',
    'MAANG',
    'Magnificent Seven',

    // Events
    'licenciements tech',
    'tech layoffs',
    'IPO tech',
    'introduction en bourse',
    'acquisition',
    'fusion',
    'merger',
  ],
} as const;

export type KeywordCategory = keyof typeof TECH_KEYWORDS;
