# Konekode 貓貓競程

從零開始的競技程式教學網站，由一隻黑貓小精靈帶著走。目前是概念驗證階段的原型，只有第一個單元。

試玩：https://konekode.pappdatap.workers.dev/learn/start/

## 開發

需要 [devenv](https://devenv.sh)。

```sh
devenv shell -- just dev      # 開發伺服器
devenv shell -- just check    # 型別、程式碼規則、單元測試、建置、排版
devenv shell -- just e2e      # 端到端測試（Chromium、Firefox、WebKit）
```

第一次建置會把瀏覽器內的編譯器壓縮一次，大約五分鐘，之後有快取。

## 分支

- `dev`：日常開發，合併請求以它為目標。
- `main`：發布用，只接受從 `dev` 來的合併。

## 授權

還沒決定，決定前請先不要重製或散布。
