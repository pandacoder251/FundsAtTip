import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// --- Data Simulation ---
const initialStocks = [
    { id: 1, ticker: 'GOOGL', name: 'Alphabet Inc.', price: 175.45, change: 1.25, changePercent: 0.72, trend: 'up', marketCap: 2.2 },
    { id: 2, ticker: 'MSFT', name: 'Microsoft Corp.', price: 410.12, change: -0.88, changePercent: -0.21, trend: 'down', marketCap: 3.0 },
    { id: 3, ticker: 'AMZN', name: 'Amazon Inc.', price: 180.99, change: 2.15, changePercent: 1.20, trend: 'up', marketCap: 1.9 },
    { id: 4, ticker: 'TSLA', name: 'Tesla Inc.', price: 195.60, change: -3.50, changePercent: -1.76, trend: 'down', marketCap: 0.6 },
    { id: 5, ticker: 'NVDA', name: 'NVIDIA Corp.', price: 900.20, change: 15.50, changePercent: 1.75, trend: 'up', marketCap: 2.2 },
    { id: 6, ticker: 'JPM', name: 'JPMorgan Chase', price: 199.10, change: 0.55, changePercent: 0.28, trend: 'up', marketCap: 0.5 },
];

const mockTop100 = Array.from({ length: 100 }, (_, i) => ({
    rank: i + 1,
    ticker: initialStocks[i % initialStocks.length].ticker,
    performance: (Math.random() * 5 - 2).toFixed(2), // Random performance between -2 and 3
    time: '1h',
    market: i < 50 ? 'Stocks' : 'MF',
}));

// --- Utility Components and Functions ---

/** Icon component for visual clarity (simulated Lucide icons) */
const Icon = ({ path, className = "w-6 h-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        {path}
    </svg>
);

/** Displays a single stock's price trend */
const TrendIndicator = ({ changePercent }) => {
    const isPositive = changePercent >= 0;
    const color = isPositive ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400';
    const arrow = isPositive ?
        <Icon className="w-4 h-4 mr-1 fill-current" path={<path d="M12 19V5M5 12l7-7 7 7" />} /> :
        <Icon className="w-4 h-4 mr-1 fill-current" path={<path d="M12 5v14M5 12l7 7 7-7" />} />;

    return (
        <span className={`flex items-center font-bold ${color}`}>
            {arrow}
            {Math.abs(changePercent).toFixed(2)}%
        </span>
    );
};

/** Dark/Light Mode Toggle Button */
const ThemeToggle = ({ isDark, toggleDark }) => (
    <button
        onClick={toggleDark}
        className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
        <Icon className="w-6 h-6" path={isDark ?
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" /> :
            <path d="M12 2a1 1 0 0 0 0 2M12 20a1 1 0 0 0 0 2M20 12a1 1 0 0 0 2 0M2 12a1 1 0 0 0 2 0M18.36 5.64a1 1 0 0 0 0 1.41M5.64 18.36a1 1 0 0 0 0-1.41M5.64 5.64a1 1 0 0 0 1.41 0M18.36 18.36a1 1 0 0 0 1.41 0M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0 10z" />
        } />
    </button>
);

/**
 * Handles the interaction with the Gemini API using exponential backoff.
 * This function is used by both the Chatbot and the new AI features.
 * @param {string} prompt The user's query.
 * @param {function} onResponse Callback function for successful response.
 * @param {function} onError Callback function for errors.
 * @param {string} systemPrompt The system instruction to guide the model's persona.
 * @param {boolean} useGrounding Whether to enable Google Search grounding.
 */
const callGeminiApi = async (prompt, onResponse, onError, systemPrompt, useGrounding = true) => {
    const defaultSystemPrompt = "You are a friendly, concise, and helpful financial assistant named 'Wisbee'. Provide short, actionable advice or information based on financial markets, avoiding overly complex jargon. Always answer concisely.";
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        tools: useGrounding ? [{ "google_search": {} }] : undefined,
        systemInstruction: {
            parts: [{ text: systemPrompt || defaultSystemPrompt }]
        },
    };

    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 429 && attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    attempt++;
                    continue;
                }
                throw new Error(`API call failed with status: ${response.status}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const text = candidate.content.parts[0].text;
                let sources = [];
                const groundingMetadata = candidate.groundingMetadata;

                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title,
                        }))
                        .filter(source => source.uri && source.title);
                }
                onResponse({ text, sources });
                return;
            } else {
                throw new Error("Invalid response structure from Gemini API.");
            }

        } catch (error) {
            if (attempt === maxRetries - 1) {
                onError(`Error: Could not get a response after ${maxRetries} attempts.`);
                return;
            }
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
};

// --- Gemini Chatbot Component (Dashboard) ---

const GeminiChatbot = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState([
        { role: 'model', text: 'Hello! I am Wisbee, your financial assistant. How can I help you with your dashboard or market questions today?' }
    ]);
    const chatEndRef = useRef(null);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [history]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setHistory(prev => [...prev, { role: 'user', text: userMessage }]);
        setIsLoading(true);

        const onResponse = (data) => {
            setHistory(prev => [...prev, { role: 'model', text: data.text, sources: data.sources }]);
            setIsLoading(false);
        };

        const onError = (errorMessage) => {
            setHistory(prev => [...prev, { role: 'model', text: errorMessage }]);
            setIsLoading(false);
        };

        // Chatbot uses Google Search grounding by default
        await callGeminiApi(userMessage, onResponse, onError);
    };

    // Icon Paths
    const robotIconPath = <path d="M17 18a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2zM9 13v-2M15 13v-2M12 2a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zM4 9h4M16 9h4M12 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />;
    const closeIconPath = <path d="M18 6L6 18M6 6l12 12" />;

    return (
        <div className="fixed bottom-20 md:bottom-4 right-4 z-50">
            {/* Chat Bubble Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-14 h-14 rounded-full bg-indigo-600 text-white shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
                title={isOpen ? "Close Chat" : "Open Chat"}
            >
                <Icon className="w-6 h-6" path={isOpen ? closeIconPath : robotIconPath} />
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-40 md:bottom-20 right-4 w-[90vw] max-w-sm h-[70vh] max-h-[600px] bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col border border-gray-200 dark:border-gray-700">
                    {/* Header */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-indigo-600 rounded-t-xl flex items-center">
                        <Icon className="w-5 h-5 mr-2 text-white fill-current" path={robotIconPath} />
                        <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-heading)' }}>Chat with Wisbee</h3>
                    </div>

                    {/* Chat History */}
                    <div className="flex-grow overflow-y-auto p-4 space-y-4">
                        {history.map((msg, index) => (
                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl shadow-md ${msg.role === 'user'
                                    ? 'bg-indigo-500 text-white rounded-br-none'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'
                                    }`}>
                                    <p>{msg.text}</p>
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-600 text-xs opacity-70">
                                            <p className="font-semibold mb-1">Sources:</p>
                                            {msg.sources.slice(0, 3).map((source, i) => (
                                                <a key={i} href={source.uri} target="_blank" rel="noopener noreferrer" className="block truncate hover:underline text-xs">
                                                    - {source.title}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="max-w-[80%] p-3 rounded-2xl rounded-tl-none bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                                    <div className="flex items-center space-x-1">
                                        <span className="animate-pulse w-2 h-2 bg-indigo-500 rounded-full"></span>
                                        <span className="animate-pulse w-2 h-2 bg-indigo-500 rounded-full delay-100"></span>
                                        <span className="animate-pulse w-2 h-2 bg-indigo-500 rounded-full delay-200"></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSend} className="p-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask a financial question..."
                                className="flex-grow p-3 border border-gray-300 dark:border-gray-600 rounded-l-xl focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white transition duration-200"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                className={`px-4 rounded-r-xl font-bold transition duration-300 flex items-center justify-center ${isLoading || !input.trim()
                                    ? 'bg-gray-400 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }`}
                                disabled={isLoading || !input.trim()}
                            >
                                <Icon className="w-5 h-5" path={<path d="M5 12l14-5M5 12l14 5M5 12h14" />} />
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

// --- Per-Stock News Summary Component ---

const StockItem = ({ stock }) => {
    const [newsState, setNewsState] = useState({ text: null, isLoading: false, isError: false });

    const fetchNews = useCallback(async () => {
        if (newsState.isLoading) return;

        // Reset state and show loader
        setNewsState({ text: null, isLoading: true, isError: false });

        const prompt = `Provide a single, very concise, one-sentence summary of the latest market news and current sentiment for ${stock.ticker} (${stock.name}).`;

        const onResponse = (data) => {
            setNewsState({ text: data.text, isLoading: false, isError: false });
        };

        const onError = (errorMessage) => {
            setNewsState({ text: 'Could not fetch news summary.', isLoading: false, isError: true });
        };

        // Use the global utility function for grounded news
        await callGeminiApi(prompt, onResponse, onError);
    }, [stock.ticker, stock.name, newsState.isLoading]);

    const sparkleIconPath = <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.21 1.18-6.88-5-4.87 6.91-1.01L12 2z" />;

    return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md transition duration-200 hover:shadow-lg border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-start">
                {/* Left Side: Ticker and Name */}
                <div>
                    <p className="text-lg font-semibold text-indigo-600 dark:text-indigo-400">{stock.ticker}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{stock.name}</p>
                </div>

                {/* Right Side: Price, Trend, and News Button */}
                <div className="flex flex-col items-end">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">${stock.price.toFixed(2)}</p>
                    <TrendIndicator changePercent={stock.changePercent} />

                    <button
                        onClick={fetchNews}
                        disabled={newsState.isLoading}
                        className={`mt-2 flex items-center text-xs font-medium px-2 py-1 rounded-full transition duration-300 shadow-sm ${newsState.isLoading
                            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800'
                            }`}
                        title="Get Latest News Summary powered by Gemini"
                    >
                        <Icon className="w-3 h-3 mr-1 fill-current" path={sparkleIconPath} />
                        {newsState.isLoading ? 'Loading...' : 'News Summary'}
                    </button>
                </div>
            </div>

            {/* News Summary Display */}
            {(newsState.text || newsState.isError) && (
                <div className={`mt-3 p-3 text-sm rounded-lg border ${newsState.isError
                    ? 'bg-red-50 dark:bg-red-900/50 border-red-300 text-red-700 dark:text-red-300'
                    : 'bg-indigo-50 dark:bg-gray-700 border-indigo-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                    <p className="font-semibold text-gray-800 dark:text-white mb-1">Wisbee's Insight:</p>
                    <p>{newsState.text}</p>
                </div>
            )}
        </div>
    );
};

// --- Core Components (Rest of the application) ---

/** Continuously scrolling stock performance ticker */
const StockTicker = ({ stocks }) => {
    // Duplicate the stocks to create a seamless loop
    const tickerContent = [...stocks, ...stocks];

    return (
        <div className="overflow-hidden whitespace-nowrap py-2 bg-indigo-600 dark:bg-indigo-800 shadow-xl">
            <style jsx="true">
                {`
                    @keyframes scroll {
                        0% { transform: translateX(0); }
                        100% { transform: translateX(-50%); }
                    }
                    .ticker-animation {
                        animation: scroll 30s linear infinite;
                        display: inline-block;
                        white-space: nowrap;
                    }
                `}
            </style>
            <div className="ticker-animation flex">
                {tickerContent.map((stock, index) => (
                    <div key={index} className="inline-flex items-center mx-6 text-white text-sm font-medium">
                        <span className="mr-2 opacity-75">{stock.ticker}</span>
                        <span className="mr-4">${stock.price.toFixed(2)}</span>
                        <span className={`flex items-center text-xs ${stock.trend === 'up' ? 'text-green-200' : 'text-red-200'}`}>
                            {stock.trend === 'up' ? '▲' : '▼'} {stock.changePercent.toFixed(2)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Mobile Header */
const MobileHeader = ({ isDark, toggleDark }) => (
    <header className="md:hidden sticky top-0 z-20 bg-white dark:bg-gray-900 shadow-lg border-b border-gray-100 dark:border-gray-800">
        <div className="flex justify-between items-center px-4 py-3">
            <h1 className="text-2xl font-extrabold text-indigo-600" style={{ fontFamily: 'var(--font-heading)' }}>FundAtTips</h1>
            <ThemeToggle isDark={isDark} toggleDark={toggleDark} />
        </div>
    </header>
);

/** Main Navigation Bar (Desktop Header) */
const HeaderNav = ({ activeView, setActiveView, isDark, toggleDark }) => {

    const navItems = [
        { name: 'Home', view: 'Dashboard' },
        { name: 'Performance', view: 'Performance' },
        { name: 'Analysis', view: 'Analysis' },
        { name: 'Account', view: 'Account' },
    ];

    return (
        <header className="hidden md:block sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center py-5">
                <h1 className="text-4xl font-extrabold text-indigo-600" style={{ fontFamily: 'var(--font-heading)' }}>FundAtTips</h1>
                <nav className="flex space-x-4">
                    {navItems.map(item => (
                        <button
                            key={item.name}
                            onClick={() => setActiveView(item.view)}
                            className={`font-semibold py-2 px-4 rounded-xl transition duration-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 ${activeView === item.view
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400'
                                }`}
                        >
                            {item.name}
                        </button>
                    ))}
                </nav>
                <div className="flex items-center space-x-4">
                    <ThemeToggle isDark={isDark} toggleDark={toggleDark} />
                </div>
            </div>
        </header>
    );
};

/** Mobile Navigation (Footer) */
const FooterNav = ({ activeView, setActiveView }) => {
    const navItems = [
        { name: 'Home', icon: <path d="M3 3v18h18M18 17l-5-5-4 4-2-2M13 5h6v6" />, view: 'Dashboard' },
        { name: 'Performance', icon: <path d="M2 13h4M18 13h4M7 3v18M17 3v18M10 8h4V5h-4zM10 19h4v-3h-4zM10 15h4v-2h-4z" />, view: 'Performance' },
        { name: 'Analysis', icon: <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.74 1.74M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.74-1.74" />, view: 'Analysis' },
        { name: 'Account', icon: <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />, view: 'Account' },
    ];

    return (
        <footer className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 z-20 shadow-2xl">
            <div className="flex justify-around items-center h-16">
                {navItems.map(item => (
                    <button
                        key={item.name}
                        onClick={() => setActiveView(item.view)}
                        className={`flex flex-col items-center p-2 transition duration-300 ${activeView === item.view ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                    >
                        <Icon className="w-5 h-5" path={item.icon} />
                        <span className="text-xs font-medium mt-1">{item.name}</span>
                    </button>
                ))}
            </div>
        </footer>
    );
};

/** Dashboard View Component */
const DashboardView = ({ stocks, top100, performanceFilter, setPerformanceFilter, dailyUpdateFilter, setDailyUpdateFilter, searchTerm, setSearchTerm, setActiveView }) => {
    // Filter stocks based on search term
    const filteredStocks = useMemo(() => {
        if (!searchTerm && !performanceFilter) return []; // Only return empty array if no filter is set

        return stocks.filter(stock =>
            stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
            stock.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [stocks, searchTerm, performanceFilter]);

    // Determines if the stock list should be visible (if search term is entered OR a filter button is clicked)
    const shouldShowStocks = searchTerm.trim() !== '' || performanceFilter !== '';

    // Mobile UI state for daily update filter popover
    const [showDailyOptionsMobile, setShowDailyOptionsMobile] = useState(false);

    // Simulated Market Data Card
    const MarketCard = ({ title, value, subtext, trend }) => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl transition duration-300 transform hover:scale-[1.02] border border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            {/* Poppins for numerical/important headings */}
            <h3 className="text-3xl font-extrabold mt-1" style={{ fontFamily: 'var(--font-heading)' }}>
                {value}
            </h3>
            <div className="flex items-center mt-3">
                <TrendIndicator changePercent={trend} />
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{subtext}</span>
            </div>
        </div>
    );

    // Top 100 Ranking Table
    const TopRankingTable = ({ rankings }) => (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
            {/* Poppins for main title */}
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center" style={{ fontFamily: 'var(--font-heading)' }}>
                <Icon className="w-5 h-5 mr-2 text-indigo-500" path={<path d="M12 2l3 3h6v12h-6l-3 3-3-3H3V5h6z" />} />
                Top 100 Performers ({rankings[0]?.time || 'Hourly'})
            </h3>
            <div className="overflow-x-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider rounded-tl-lg">Rank</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ticker</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Market</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider rounded-tr-lg">Performance</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {rankings.slice(0, 10).map((item) => (
                            <tr key={item.rank} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition duration-150">
                                <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.rank}</td>
                                <td className="px-3 py-3 whitespace-nowrap text-sm text-indigo-600 dark:text-indigo-400">{item.ticker}</td>
                                <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{item.market}</td>
                                <td className="px-3 py-3 whitespace-nowrap text-sm text-right">
                                    <span className={`font-semibold ${item.performance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {item.performance >= 0 ? '+' : ''}{item.performance}%
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">Showing top 10 of 100.</p>
        </div>
    );

    return (
        <section className="p-4 md:p-8 space-y-8 min-h-screen">
            {/* Poppins for main heading */}
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white border-b pb-3 border-gray-200 dark:border-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>
                Overall Portfolio Summary
            </h2>

            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <MarketCard title="Total Portfolio Value" value="$1.5M" subtext="Since last month" trend={8.5} />
                <MarketCard title="S&P 500 Index" value="5,450.23" subtext="Today" trend={0.65} />
                <MarketCard title="Top Gainer" value="NVDA" subtext="Last 24h" trend={1.75} />
                <MarketCard title="Cash Available" value="$12,500" subtext="Ready to invest" trend={0} />
            </div>

            {/* --- BUTTON: Redirect from  Dashboard to Performance --- */}
            <div className="flex justify-end">
                <button
                    onClick={() => setActiveView('Performance')}
                    className="flex items-center bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-xl shadow-lg transition duration-300 transform hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
                    title="Go to Detailed Performance View"
                >
                    <Icon className="w-5 h-5 mr-2" path={<path d="M22 12h-4l-3 9L9 3l-3 9H2" />} />
                    View Detailed Performance Metrics
                </button>
            </div>
            {/* --- END BUTTON --- */}

            {/* Controls and Filters */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-lg flex flex-col md:flex-row gap-4 items-center border border-gray-100 dark:border-gray-700">
                <div className="w-full md:w-1/3">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search Stocks or Mutual Funds..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full p-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white transition duration-200"
                        />
                        <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" path={<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" />} />
                    </div>
                </div>

                {/* Performance Filter */}
                <div className="flex w-full md:w-2/3 space-x-2 md:space-x-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0 pt-2">Performance:</label>
                    {['1D', '1W', '1M', '1Y'].map(filter => (
                        <button
                            key={filter}
                            onClick={() => setPerformanceFilter(filter)}
                            className={`px-3 py-2 text-sm font-medium rounded-lg transition duration-200 ${performanceFilter === filter
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-gray-600'
                                }`}
                        >
                            {filter}
                        </button>
                    ))}
                    {/* Desktop/tablet select (md+) */}
                    <div className="hidden md:block">
                        <select
                            value={dailyUpdateFilter}
                            onChange={(e) => setDailyUpdateFilter(e.target.value)}
                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-xl dark:bg-gray-700 dark:text-white text-sm"
                        >
                            <option value="all">Daily Update: All</option>
                            <option value="latest">Daily Update: Latest</option>
                            <option value="important">Daily Update: Important</option>
                        </select>
                    </div>

                    {/* Mobile: compact button that opens a small popover for daily update options */}
                    <div className="md:hidden relative">
                        <button
                            onClick={() => setShowDailyOptionsMobile(v => !v)}
                            className="p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-sm w-full text-left"
                            aria-expanded={showDailyOptionsMobile}
                        >
                            {dailyUpdateFilter === 'all' ? 'Daily: All' : dailyUpdateFilter === 'latest' ? 'Daily: Latest' : 'Daily: Important'}
                        </button>
                        {showDailyOptionsMobile && (
                            <ul className="absolute left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-40 text-sm">
                                <li className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onMouseDown={() => { setDailyUpdateFilter('all'); setShowDailyOptionsMobile(false); }}>Daily Update: All</li>
                                <li className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onMouseDown={() => { setDailyUpdateFilter('latest'); setShowDailyOptionsMobile(false); }}>Daily Update: Latest</li>
                                <li className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onMouseDown={() => { setDailyUpdateFilter('important'); setShowDailyOptionsMobile(false); }}>Daily Update: Important</li>
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content: Stock List and Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Stock List: Now conditionally rendered based on user selection */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center" style={{ fontFamily: 'var(--font-heading)' }}>
                        <Icon className="w-6 h-6 mr-2 text-indigo-500" path={<path d="M7 13l3 3 7-7m1 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />} />
                        Filtered Watchlist
                    </h2>
                    {shouldShowStocks ? (
                        filteredStocks.length > 0 ? (
                            filteredStocks.map(stock => (
                                <StockItem key={stock.id} stock={stock} />
                            ))
                        ) : (
                            <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-xl border-dashed border-2 border-gray-300 dark:border-gray-600">
                                <p className="text-gray-500 dark:text-gray-400">No stocks match your search criteria.</p>
                            </div>
                        )
                    ) : (
                        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-xl border-dashed border-2 border-gray-300 dark:border-gray-600">
                            <p className="text-gray-500 dark:text-gray-400">Select a performance filter (1D, 1W, etc.) or use the search bar to view your watchlist.</p>
                        </div>
                    )}
                </div>

                {/* Top 100 Ranking */}
                <div className="lg:col-span-1">
                    <TopRankingTable rankings={mockTop100} />
                </div>
            </div>
        </section>
    );
};

/** Animated Pie Chart Placeholder */
const ChartPlaceholder = () => (
    <div className="h-64 flex flex-col justify-center items-center text-center p-8 bg-indigo-50 dark:bg-gray-700/50 rounded-xl border-2 border-dashed border-indigo-400 dark:border-indigo-600 relative overflow-hidden">
        <style jsx="true">
            {`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes dashpulse {
                    0% { stroke-dashoffset: 0; }
                50% { stroke-dashoffset: 150; }
                100% { stroke-dashoffset: 0; }
            }
            .chart-ring {
                animation: spin 8s linear infinite;
                transform-origin: 50% 50%;
            }
            .chart-dash {
                animation: dashpulse 4s ease-in-out infinite;
            }
        `}
        </style>

        {/* Animated Spinning SVG Ring */}
        <svg width="100" height="100" viewBox="0 0 100 100" className="mb-4 chart-ring">
            <circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke="#6366f1" /* Indigo-500 */
                strokeWidth="5"
                strokeDasharray="10 90"
                className="chart-dash"
                strokeLinecap="round"
            />
        </svg>

        {/* Text Content */}
        <Icon className="w-8 h-8 mb-2 text-indigo-700 dark:text-indigo-300" path={<path d="M13 10V3L4 14h7v7l9-11h-7z" />} />
        {/* Poppins for sub-heading */}
        <h4 className="text-xl font-bold text-indigo-700 dark:text-indigo-300" style={{ fontFamily: 'var(--font-heading)' }}>Analysis Not Live</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Data loading simulation is active. Connect to a live API for visualization.
        </p>
    </div>
);


/** Analysis View Component - Enhanced with AI Diversification Analysis */
const AnalysisView = ({ setActiveView, stocks }) => {
    const [analysisReport, setAnalysisReport] = useState(null);
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

    // Convert current simulated portfolio into a string for the LLM prompt
    const portfolioData = useMemo(() =>
        stocks.map(s => `${s.ticker} (${s.name}) $${s.price.toFixed(2)}, Market Cap: ${s.marketCap}B`).join('; '),
        [stocks]);

    const generateAnalysis = useCallback(async () => {
        if (isAnalysisLoading) return;
        setIsAnalysisLoading(true);
        setAnalysisReport(null);

        const systemPrompt = "You are a senior financial risk analyst. Analyze the provided portfolio for diversification issues, and output a concise summary followed by three concrete, actionable, and generalized asset recommendations (not specific stocks/tickers) to improve the risk profile. Format your response clearly using markdown headings for each section (Summary and Recommendations).";

        const prompt = `Analyze the following mock portfolio for diversification risks. It is heavily concentrated. Portfolio: ${portfolioData}`;

        const onResponse = (data) => {
            setIsAnalysisLoading(false);
            setAnalysisReport(data.text);
        };

        const onError = (errorMessage) => {
            setIsAnalysisLoading(false);
            setAnalysisReport(`Error generating analysis: ${errorMessage}. Please try again.`);
        };

        // Use the global utility function. Grounding is helpful for recommending general asset classes.
        await callGeminiApi(prompt, onResponse, onError, systemPrompt, true);
    }, [isAnalysisLoading, portfolioData]);

    // Simulated chart data (ALL ZEROS as requested)
    const chartData = useMemo(() => [
        { name: 'Stocks', value: 0, color: '#4F46E5' }, // Indigo
        { name: 'Mutual Funds', value: 0, color: '#10B981' }, // Green
        { name: 'Cash', value: 0, color: '#F59E0B' }, // Amber
    ], []);

    const handleImportExcel = () => {
        console.log("Simulating Excel Import: Data analyzed and merged into portfolio.");
        const messageBox = document.createElement('div');
        messageBox.className = 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 text-white p-4 rounded-xl shadow-2xl z-50 transition-opacity duration-300';
        messageBox.textContent = 'Import simulated: Data analyzed and merged!';
        document.body.appendChild(messageBox);
        setTimeout(() => document.body.removeChild(messageBox), 2000);
    };

    const riskIconPath = <path d="M12 2L1 21h22z" />;

    return (
        <section className="p-4 md:p-8 space-y-8 min-h-screen">
            {/* Poppins for main heading */}
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white border-b pb-3 border-gray-200 dark:border-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>
                In-Depth Financial Analysis
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Visualization Panel */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
                    {/* Poppins for sub-heading */}
                    <h3 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-white flex items-center" style={{ fontFamily: 'var(--font-heading)' }}>
                        <Icon className="w-6 h-6 mr-2 text-indigo-500" path={<path d="M3 15s1-4 4-4 5 2 8 2 4-4 4-4V3" />} />
                        Current Asset Allocation
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">

                        {/* Animated Chart Placeholder */}
                        <div className="h-64 flex justify-center items-center">
                            <ChartPlaceholder />
                        </div>

                        {/* Legend reflecting zero data */}
                        <div className="space-y-4">
                            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Simulated Allocation:</p>
                            {chartData.map(item => (
                                <div key={item.name} className="flex justify-between items-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700 transition duration-200 hover:shadow-lg">
                                    <div className="flex items-center">
                                        <div className="w-4 h-4 rounded-full mr-3" style={{ backgroundColor: item.color }}></div>
                                        <span className="font-medium text-gray-700 dark:text-gray-200">{item.name}</span>
                                    </div>
                                    <span className="text-xl font-bold" style={{ color: item.color, fontFamily: 'var(--font-heading)' }}>{item.value}%</span>
                                </div>
                            ))}
                            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
                                <div className="flex justify-between items-center font-bold text-lg text-gray-800 dark:text-white">
                                    <span>Total Allocated</span>
                                    <span className="text-indigo-600 dark:text-indigo-400">{chartData.reduce((sum, item) => sum + item.value, 0)}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Import and Tools Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl space-y-4 border border-gray-100 dark:border-gray-700">
                        {/* Poppins for sub-heading */}
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-white" style={{ fontFamily: 'var(--font-heading)' }}>External Data Tools</h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Integrate your own historical transaction data for deeper custom analysis.
                        </p>
                        <button
                            onClick={handleImportExcel}
                            className="w-full flex items-center justify-center bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 transition duration-300 shadow-md transform hover:scale-[1.01]"
                        >
                            <Icon className="w-5 h-5 mr-2 fill-current" path={<path d="M14 2v4a2 2 0 0 0 2 2h4M10 20l-4-4-2 2M10 20v-4M4 14V4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />} />
                            Import Excel File (Simulated)
                        </button>
                        <p className="text-xs text-gray-400 dark:text-gray-500 pt-2">
                            *Note: Real file access is simulated for demonstration.
                        </p>
                    </div>

                    {/* AI-Powered Diversification Analysis Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl space-y-4 border border-gray-100 dark:border-gray-700">
                        {/* Poppins for sub-heading */}
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center" style={{ fontFamily: 'var(--font-heading)' }}>
                            <Icon className="w-5 h-5 mr-2 text-red-500" path={riskIconPath} />
                            Risk Profile Analysis
                        </h3>

                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Use Gemini to analyze your current simulated portfolio and generate actionable risk diversification advice.
                        </p>

                        <button
                            onClick={generateAnalysis}
                            disabled={isAnalysisLoading}
                            className={`w-full flex items-center justify-center py-3 rounded-xl font-bold transition duration-300 shadow-md transform hover:scale-[1.01] ${isAnalysisLoading
                                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                        >
                            <Icon className="w-5 h-5 mr-2 fill-current" path={<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.21 1.18-6.88-5-4.87 6.91-1.01L12 2z" />} />
                            {isAnalysisLoading ? 'Analyzing Portfolio...' : 'Generate Diversification Plan ✨'}
                        </button>

                        {/* Display Analysis Report */}
                        {analysisReport && (
                            <div className="mt-4 p-4 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-gray-700 rounded-lg whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 shadow-inner">
                                <p className="font-bold mb-2 text-indigo-700 dark:text-indigo-300">Wisbee's Diversification Report:</p>
                                {/* WARNING: Rendering raw markdown output from the LLM. Using dangerouslySetInnerHTML */}
                                <div dangerouslySetInnerHTML={{ __html: analysisReport.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </section>
    );
};

/** Performance View Component: NEWLY ADDED */
const PerformanceView = ({ stocks }) => {
    const [selectedTicker, setSelectedTicker] = useState('');
    const [pvSearch, setPvSearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const selectedStock = stocks.find(s => s.ticker === selectedTicker) || null;
    const chartPath = <path d="M3 3v18h18M18 17l-5-5-4 4-2-2M13 5h6v6" />;

    // Simulated historical data generation (30 days)
    const generateSimulatedHistory = useCallback((stock) => {
        const history = [];
        let price = stock.price;
        // Generate history for the past 30 days
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            // Simulate random daily price changes based on the stock's overall trend
            const fluctuation = (Math.random() - 0.5) * 0.01 * price; // +/- 0.5% fluctuation
            const trendAdjust = stock.changePercent > 0 ? 0.001 : -0.001; // slight daily bias
            price += fluctuation + (price * trendAdjust);

            history.push({
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                price: price
            });
        }
        return history;
    }, []);

    const simulatedHistory = useMemo(() => selectedStock ? generateSimulatedHistory(selectedStock) : [], [selectedStock, generateSimulatedHistory]);

    const chartData = useMemo(() => {
        // Normalize prices for bar height calculation (e.g., set the minimum price as the baseline)
        const minPrice = Math.min(...simulatedHistory.map(d => d.price));
        const maxPrice = Math.max(...simulatedHistory.map(d => d.price));
        const priceRange = maxPrice - minPrice;

        return simulatedHistory.map(day => ({
            ...day,
            // Calculate height as a percentage of the total price range above the minimum
            normalizedHeight: priceRange > 0 ? (day.price - minPrice) / priceRange : 0,
        }));
    }, [simulatedHistory]);

    return (
        <section className="p-4 md:p-8 space-y-8 min-h-screen">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white border-b pb-3 border-gray-200 dark:border-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>
                Individual Stock Performance
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Search Selector & Info */}
                <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
                    <label htmlFor="ticker-search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Search:</label>
                    <div className="relative">
                        <input
                            id="ticker-search"
                            type="text"
                            value={pvSearch}
                            onChange={(e) => { setPvSearch(e.target.value); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            placeholder="Search to check performance..."
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white transition duration-200"
                        />
                        {showSuggestions && pvSearch.trim() !== '' && (
                            <ul className="absolute left-0 right-0 mt-2 max-h-48 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
                                {stocks.filter(s => s.ticker.toLowerCase().includes(pvSearch.toLowerCase()) || s.name.toLowerCase().includes(pvSearch.toLowerCase())).slice(0, 8).map(s => (
                                    <li key={s.ticker} onMouseDown={() => { setSelectedTicker(s.ticker); setPvSearch(''); setShowSuggestions(false); }} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex justify-between items-center">
                                        <span className="font-medium text-gray-800 dark:text-gray-100">{s.ticker}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{s.name}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="mt-6 space-y-3">
                        {selectedStock ? (
                            <>
                                <h4 className="font-bold text-lg text-indigo-600 dark:text-indigo-400">{selectedStock.ticker} Metrics</h4>
                                <p className="text-sm text-gray-700 dark:text-gray-300">Price: <span className="font-semibold">${selectedStock.price.toFixed(2)}</span></p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">Mkt Cap: <span className="font-semibold">${selectedStock.marketCap}T</span></p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">Today: <TrendIndicator changePercent={selectedStock.changePercent} /></p>
                            </>
                        ) : (
                            <div className="text-center p-4 rounded-lg bg-gray-50 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-300">
                                <p className="font-semibold mb-1">Search to check performance</p>
                                <p className="text-xs">Type a ticker or company name above and select from suggestions.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Performance Chart and Data */}
                <div className="lg:col-span-3 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
                    <h3 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-white flex items-center" style={{ fontFamily: 'var(--font-heading)' }}>
                        <Icon className="w-6 h-6 mr-2 text-indigo-500" path={chartPath} />
                        30-Day Simulated Price History
                    </h3>

                    {/* Chart Area: show prompt when no selection, otherwise show simulated chart */}
                    {selectedStock ? (
                        <div className="h-96 relative flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                            <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col justify-end p-4">
                                <div className="flex justify-between items-end h-full w-full">
                                    {chartData.map((day, index) => (
                                        <div key={index} className="flex flex-col items-center justify-end h-full group w-2 md:w-3">
                                            <div
                                                className="w-full rounded-t-sm bg-indigo-500 transition-all duration-300 hover:bg-indigo-700"
                                                style={{ height: `${10 + (day.normalizedHeight * 80)}%`, minHeight: '5px' }}
                                            ></div>
                                            <div className="absolute top-0 mt-2 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition duration-300 pointer-events-none z-10">
                                                {day.date}: ${day.price.toFixed(2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="absolute bottom-4 left-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Price ($)</p>
                                <p className="absolute bottom-4 right-4 text-xs font-semibold text-gray-500 dark:text-gray-400">Time (Days)</p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-96 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-700">
                            <div className="text-center p-6">
                                <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">Search to check performance</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Type a ticker above and choose a result to view the simulated price history and risk metrics.</p>
                            </div>
                        </div>
                    )}

                    {/* Simulated Data Table */}
                    <div className="mt-6">
                        <h4 className="font-bold text-lg text-gray-800 dark:text-white mb-3">Recent Closings</h4>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 rounded-lg overflow-hidden">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Closing Price</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {chartData.slice(-5).reverse().map((day, index) => (
                                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{day.date}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-indigo-600 dark:text-indigo-400">${day.price.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

/** Account View Component */
const AccountView = () => (
    <section className="p-4 md:p-8 space-y-8 min-h-screen">
        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700">
            {/* Poppins for main heading */}
            <h2 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-6 border-b pb-4 border-gray-200 dark:border-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>
                My FundAtTips Account
            </h2>

            {/* Profile Image and Info */}
            <div className="flex items-center space-x-6 mb-8">
                {/* Simulated Google Photos Aesthetic */}
                <img
                    src="https://placehold.co/80x80/e0e7ff/4338ca?text=User"
                    alt="User Profile"
                    className="w-20 h-20 rounded-full ring-4 ring-indigo-500/50"
                />
                <div>
                    {/* Poppins for name/main info */}
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white" style={{ fontFamily: 'var(--font-heading)' }}>Alex Johnson</p>
                    <p className="text-gray-500 dark:text-gray-400">alex.j@FundAtTips.com</p>
                </div>
            </div>

            {/* Settings Cards */}
            <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <div className="flex items-center">
                        <Icon className="w-6 h-6 mr-3 text-indigo-500" path={<path d="M10 12h.01M14 12h.01M18 12h.01M6 12h.01M2 12h.01M22 12h.01M3 21h18" />} />
                        <span className="font-medium text-gray-800 dark:text-gray-200">Subscription Status</span>
                    </div>
                    <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full dark:bg-green-700 dark:text-green-100">Premium Active</span>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <div className="flex items-center">
                        <Icon className="w-6 h-6 mr-3 text-indigo-500" path={<path d="M12 2l-5 5h10M12 22l5-5h-10" />} />
                        <span className="font-medium text-gray-800 dark:text-gray-200">Security & Privacy</span>
                    </div>
                    <button className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800">Manage Settings</button>
                </div>

                <button className="w-full text-center bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition duration-300 shadow-lg mt-6">
                    Sign Out
                </button>
            </div>
        </div>
    </section>
);

/** Main App Component */
const App = () => {
    // Initial view is 'Dashboard', which is now renamed 'Summary' in the UI
    const [activeView, setActiveView] = useState('Dashboard');
    const [isDark, setIsDark] = useState(true); // Defaulting to dark mode for modern look

    // Dashboard State
    const [performanceFilter, setPerformanceFilter] = useState('');
    const [dailyUpdateFilter, setDailyUpdateFilter] = useState('latest');
    const [searchTerm, setSearchTerm] = useState('');

    const toggleDark = useCallback(() => setIsDark(prev => !prev), []);

    useEffect(() => {
        // Apply or remove 'dark' class to the document root element based on state
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const renderContent = () => {
        switch (activeView) {
            case 'Dashboard':
                return (
                    <DashboardView
                        stocks={initialStocks}
                        top100={mockTop100}
                        performanceFilter={performanceFilter}
                        setPerformanceFilter={setPerformanceFilter}
                        dailyUpdateFilter={dailyUpdateFilter}
                        setDailyUpdateFilter={setDailyUpdateFilter}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        setActiveView={setActiveView} // Passed down the state setter
                    />
                );
            case 'Performance':
                return <PerformanceView stocks={initialStocks} />;
            case 'Analysis':
                return <AnalysisView setActiveView={setActiveView} stocks={initialStocks} />;
            case 'Account':
                return <AccountView />;
            default:
                return <DashboardView stocks={initialStocks} top100={mockTop100} />;
        }
    };

    return (
        <div className={isDark ? 'dark' : ''}>
            {/* GLOBAL FONT STACK INJECTION: Poppins and DM Sans */}
            <style jsx="true">
                {`
                    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
                    
                    :root {
                        --font-body: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                        --font-heading: 'Poppins', 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    }

                    html, body, #root {
                        font-family: var(--font-body);
                    }
                    
                    h1, h2, h3, h4, .font-extrabold {
                        font-family: var(--font-heading);
                    }
                `}
            </style>

            <div className="pt-[56px] md:pt-0 min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
                <MobileHeader isDark={isDark} toggleDark={toggleDark} />
                <HeaderNav
                    activeView={activeView}
                    setActiveView={setActiveView}
                    isDark={isDark}
                    toggleDark={toggleDark}
                />

                <StockTicker stocks={initialStocks} />

                <main className="pb-20 md:pb-0 max-w-7xl mx-auto">
                    {renderContent()}
                </main>

                <FooterNav activeView={activeView} setActiveView={setActiveView} />

                {/* Gemini Chatbot - Renders the floating bubble only on the Dashboard view */}
                {activeView === 'Dashboard' && <GeminiChatbot />}
            </div>
        </div>
    );
};

export default App;