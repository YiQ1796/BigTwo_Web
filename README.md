# 大老二 Big Two｜好友連線版

正式獨立 Repository： https://github.com/YiQ1796/BigTwo_Web

本專案**不與財富帝國共用遊戲原始碼或網站**。第一版支援四個座位、真人不足 AI 自動補位、六碼房間、PeerJS/WebRTC 房主連線、單張／對子／三條／順子／葫蘆／鐵支／同花順，第一局必須由梅花 3 開始，13 張一條龍可直接獲勝。

## 遊戲網址與部署
預定 GitHub Pages 網址： https://yiq1796.github.io/BigTwo_Web/ （需以 Pages Action 成功與公開頁面實際載入為準）。

部署工作流程：.github/workflows/pages.yml。GitHub Pages 第一次啟用若尚未設定，Settings → Pages → Build and deployment → Source 選擇 GitHub Actions。

## 撲克牌圖片
目前是暫用 CSS／文字牌面；以後使用者提供圖片時，放入 docs/assets/cards/，在 docs/card-assets.js 設定 window.BIG_TWO_CARD_IMAGES 映射，新圖直接取代舊牌面，禁止疊加。詳見 CARD_ASSET_SPEC.md。

## 技術限制與測試
此版本使用第三方公開 PeerJS signaling 和瀏覽器 P2P，部分 NAT / 公司網路可能需要 TURN 服務才能互連。房主須保持網頁開啟；房主關閉、重新整理及玩家跨網路互連必須用真實裝置驗收，不可只憑網站載入判定多人連線已通過。

## Code Review 後續改善
1. PeerJS 斷線重連及房主重新整理後同房號恢復應加入定時重試與狀態版本核對。
2. 客戶端訊息應加入限流、回合版本與重放請求防護，避免短時間重複操作。
3. AI 的合法牌型評估應加入拆牌代價、對手剩餘張數與策略評分，並擴充單元測試。
