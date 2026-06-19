// 
// 🔑 APIキーを入れる
// 

console.log("外部JavaScript（app.js）が正常に読み込まれました");

document.getElementById('searchBtn').addEventListener('click', async () => {
    console.log("検索ボタンがクリックされました！");

    const userInputTitle = document.getElementById('movieTitle').value.trim();
    const resultArea = document.getElementById('resultArea');
    const libraryTd = document.getElementById('movieLibrary');

    if (!userInputTitle) {
        alert('タイトルを入力してください');
        return;
    }

    resultArea.style.display = 'block';
    document.getElementById('movieOverview').innerHTML = '⏳ TMDbから映画情報を取得中...';
    libraryTd.innerHTML = '⏳ 関連する本と図書館の在庫を検索中...';

    try {
        // 1. TMDbから映画を検索
        const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(userInputTitle)}&language=ja`;
        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (!searchData.results || searchData.results.length === 0) {
            document.getElementById('movieOverview').innerHTML = '該当する映画が見つかりませんでした。';
            return;
        }

        const movie = searchData.results[0];
        const movieId = movie.id;

        // 2. 映画の詳細＋クレジットを取得
        const detailUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits,watch/providers&language=ja`;
        const detailResponse = await fetch(detailUrl);
        const detailData = await detailResponse.json();

        const titleName = detailData.title || userInputTitle;
        const releaseDate = detailData.release_date || '不明';
        const overview = detailData.overview || 'あらすじは登録されていません。';
        const castMembers = detailData.credits.cast.slice(0, 5).map(c => c.name).join(', ') || '情報なし';

        // スタッフの中から原作者を探す
        let authorName = '';
        if (detailData.credits && detailData.credits.crew) {
            const authorStaff = detailData.credits.crew.find(member =>
                member.job === 'Novel' ||
                member.job === 'Based on Novel' ||
                member.job === 'Author' ||
                member.department === 'Writing'
            );
            if (authorStaff) authorName = authorStaff.name;
        }

        // 3. 概要を表示
        document.getElementById('movieOverview').innerHTML = `
            <strong>タイトル：</strong> ${titleName}<br>
            <strong>公開日：</strong> ${releaseDate}<br>
            <strong>出演者：</strong> ${castMembers}<br>
            <strong>原作者：</strong> ${authorName || '（データなし）'}<br><br>
            <strong>あらすじ：</strong><br>${overview}
        `;

        // 4. オンライン視聴リンク（Amazon Prime Video と Netflix）
        const amazonVideoUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(titleName)}+Prime+Video`;
        const netflixUrl = `https://www.netflix.com/search?q=${encodeURIComponent(titleName)}`;
        document.getElementById('movieProviders').innerHTML = `
            <a href="${amazonVideoUrl}" target="_blank">Amazon Prime Videoで検索</a>
            <a href="${netflixUrl}" target="_blank">Netflixで検索</a>
        `;

        // 5. パッケージ検索リンク（楽天市場 と Amazon DVD）
        const rakutenDvdUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(titleName)}+DVD/`;
        const amazonDvdUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(titleName)}+DVD`;
        document.getElementById('movieRakuten').innerHTML = `
            <a href="${rakutenDvdUrl}" target="_blank">楽天市場でDVDを探す</a>
            <a href="${amazonDvdUrl}" target="_blank">AmazonでDVDを探す</a>
        `;

        // 6. カーリル連携
        console.log(`カーリル検索を開始します。タイトル: ${titleName} / 著者: ${authorName}`);
        checkCalilByText(titleName, authorName);

    } catch (error) {
        console.error("通信中に重大なエラーが発生しました:", error);
        alert('エラーが発生しました。コンソール（F12）のログを確認してください。');
    }
});

// Google Books でISBNを取得 → Calil /check で在庫確認
async function checkCalilByText(title, author) {
    const libraryTd = document.getElementById('movieLibrary');

    const query = author ? `${title} ${author}` : title;
    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&langRestrict=ja&maxResults=5&key=${GOOGLE_BOOKS_API_KEY}`;

    let isbn;
    try {
        const res = await fetch(gbUrl);
        const data = await res.json();

        if (!data.items || data.items.length === 0) {
            libraryTd.innerHTML = `⚠️「${title}」に関連する本がGoogle Booksで見つかりませんでした。`;
            return;
        }

        for (const item of data.items) {
            const ids = item.volumeInfo.industryIdentifiers || [];
            const found = ids.find(id => id.type === 'ISBN_13') || ids.find(id => id.type === 'ISBN_10');
            if (found) { isbn = found.identifier; break; }
        }

        if (!isbn) {
            libraryTd.innerHTML = `⚠️ 本は見つかりましたがISBNがありませんでした。`;
            return;
        }
        console.log(`ISBN取得: ${isbn}`);

    } catch (err) {
        console.error('Google Books エラー:', err);
        libraryTd.innerHTML = '❌ 本の検索中にエラーが発生しました。';
        return;
    }

    await pollCalilCheck(isbn, libraryTd);

}

// Calil /check のポーリング
async function pollCalilCheck(isbn, libraryTd, session = null) {
    let checkUrl;
    if (session) {
        checkUrl = `https://api.calil.jp/check?appkey=${CALIL_API_KEY}&session=${session}&format=json&callback=no`;
    } else {
        checkUrl = `https://api.calil.jp/check?appkey=${CALIL_API_KEY}&isbn=${isbn}&systemid=${LIBRARY_SYSTEM_ID}&format=json&callback=no`;
    }

    try {
        const res = await fetch(checkUrl);
        const text = await res.text();
        const data = JSON.parse(text.replace(/^no\(/, '').replace(/\);$/, ''));

        if (data.continue === 1) {
            console.log(`[/check] 照会中... セッション: ${data.session}`);
            setTimeout(() => pollCalilCheck(isbn, libraryTd, data.session), 2000);
            return;
        }

        const isbns = Object.keys(data.books);
        if (isbns.length === 0) {
            libraryTd.innerHTML = `⚠️ 図書館（${LIBRARY_SYSTEM_ID}）に蔵書データが見つかりませんでした。`;
            return;
        }

        const firstIsbn = isbns[0];
        const libResult = data.books[firstIsbn][LIBRARY_SYSTEM_ID];

        if (libResult && libResult.libkey && Object.keys(libResult.libkey).length > 0) {
            let resultHtml = `<strong>📚 ISBN：</strong> <code>${firstIsbn}</code><br>`;
            resultHtml += `<strong>🏢 各分館の在庫状況：</strong><ul style="margin:5px 0 0 0; padding-left:20px;">`;
            Object.keys(libResult.libkey).forEach(name => {
                resultHtml += `<li>${name}： <strong>${libResult.libkey[name]}</strong></li>`;
            });
            resultHtml += `</ul><br><a href="https://calil.jp/book/${firstIsbn}" target="_blank" style="color: green; font-weight: bold;">👉 カーリルでこの本を確認</a>`;
            libraryTd.innerHTML = resultHtml;
        } else {
            libraryTd.innerHTML = `⚠️ 登録はありますが、リアルタイム在庫が取得できませんでした（全館貸出中など）。`;
        }

    } catch (err) {
        console.error("カーリル /check エラー:", err);
        libraryTd.innerHTML = '❌ 在庫確認中にエラーが発生しました。';
    }
}