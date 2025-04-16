const NBA_API = {
    BASE_URL: "https://stats.nba.com/stats",
    HEADERS: {
        Host: "stats.nba.com",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "x-nba-stats-origin": "stats",
        "x-nba-stats-token": "true",
        Connection: "keep-alive",
        Referer: "https://www.nba.com/",
        Origin: "https://www.nba.com",
        "Cache-Control": "max-age=0",
    }
};

module.exports = { NBA_API }; 