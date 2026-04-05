const news = [
    {
        id: 'n1',
        symbol: 'AAPL',
        headline: 'Apple expands buyback authorization',
        sentiment: 'positive',
        publishedAt: '2026-04-04T14:15:00.000Z'
    },
    {
        id: 'n2',
        symbol: 'MSFT',
        headline: 'Microsoft cloud revenue beats expectations',
        sentiment: 'positive',
        publishedAt: '2026-04-03T10:30:00.000Z'
    },
    {
        id: 'n3',
        symbol: 'TSLA',
        headline: 'Tesla adjusts production outlook',
        sentiment: 'neutral',
        publishedAt: '2026-04-02T09:00:00.000Z'
    },
    {
        id: 'n4',
        symbol: 'NVDA',
        headline: 'NVIDIA announces next-gen AI accelerator',
        sentiment: 'positive',
        publishedAt: '2026-04-01T18:45:00.000Z'
    },
    {
        id: 'n5',
        symbol: 'AMZN',
        headline: 'Amazon logistics costs narrow margins',
        sentiment: 'negative',
        publishedAt: '2026-03-31T12:20:00.000Z'
    }
];

const earnings = [
    {
        symbol: 'AAPL',
        company: 'Apple Inc.',
        reportDate: '2026-04-24',
        estimateEps: 1.62
    },
    {
        symbol: 'MSFT',
        company: 'Microsoft Corporation',
        reportDate: '2026-04-22',
        estimateEps: 3.18
    },
    {
        symbol: 'TSLA',
        company: 'Tesla, Inc.',
        reportDate: '2026-04-18',
        estimateEps: 0.91
    },
    {
        symbol: 'NVDA',
        company: 'NVIDIA Corporation',
        reportDate: '2026-05-02',
        estimateEps: 6.05
    }
];

module.exports = {
    news,
    earnings
};
