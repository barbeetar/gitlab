# GitLab Issue Troubleshooting 使用 SOP

## 目的

使用 GitLab Issue 記錄與查詢 Troubleshooting 問題，內容包含：

- 日期
- 提出單位
- 問題現象
- 問題畫面
- 判斷問題原因
- 解決方式
- SOP 檔案連結

---

## 一、建立新的 Troubleshooting Issue

1. 進入 GitLab 專案。
2. 左側選單進入：

   ```text
   Plan → Work items
   ```

3. 點選：

   ```text
   New item
   ```

4. 類型選擇：

   ```text
   Issue
   ```

5. 輸入 Issue 標題，例如：

   ```text
   Grafana Dashboard 無法連線
   ```

6. 在 Description template 選擇對應的部門範本，例如：

   ```text
   資訊部
   ```

7. 依照範本填寫內容。

8. 填寫完成後，點選：

   ```text
   Create issue
   ```

---

## 二、填寫 Issue 內容

請依照以下欄位填寫：

```markdown
## 日期

2026-07-14

## 提出單位

資訊部

## 問題現象

使用者開啟 Grafana Dashboard 時無法正常連線。

## 問題畫面

貼上或拖曳問題截圖。

## 判斷問題原因

DNS 查詢發生逾時，導致上游服務名稱無法解析。

## 解決方式

導入 NodeLocalDNS，降低 DNS Timeout 與 CoreDNS 負載。

## SOP 檔案連結

貼上相關 SOP 或文件網址。
```

---

## 三、上傳問題截圖

在 Issue 的 Description 編輯框內，可以使用以下任一方式：

### 方法 1：直接貼上截圖

1. 在電腦上完成截圖。
2. 點選 Issue Description 編輯框。
3. 按下：

   ```text
   Ctrl + V
   ```

4. 等待圖片上傳完成。

### 方法 2：拖曳圖片

1. 找到電腦中的圖片檔案。
2. 將圖片拖入 Issue Description 編輯框。
3. 等待圖片上傳完成。

GitLab 會自動產生圖片 Markdown 連結，不需要手動處理圖片路徑或 API Token。

---

## 四、部門分類

每個部門使用對應的 Issue 範本，例如：

```text
資訊部
人資部
財務部
業務部
```

範本最後可以包含：

```markdown
/label "部門::資訊部"
```

建立 Issue 後，GitLab 會自動套用：

```text
部門::資訊部
```

注意事項：

- 標籤必須先在 GitLab 建立。
- `/label` 必須獨立一行。
- 標籤名稱必須完全一致。
- 必須建立 Issue 後，Quick Action 才會執行。
- 在 Repository 預覽範本時，只會看到文字，不會直接套用標籤。

---

## 五、查詢特定部門問題

1. 進入：

   ```text
   Plan → Work items
   ```

2. 在上方篩選條件選擇：

   ```text
   Label
   ```

3. 選擇部門標籤，例如：

   ```text
   部門::資訊部
   ```

4. 畫面只會顯示資訊部相關的 Issue。

---

## 六、搜尋問題

在 Work items 頁面使用搜尋框，可以輸入：

```text
Grafana
Kubernetes
DNS
Dashboard
連線失敗
```

也可以搭配標籤篩選，例如：

```text
部門::資訊部
狀態::已解決
類型::Kubernetes
```

---

## 七、更新處理結果

問題處理過程中，可以直接編輯 Issue：

1. 開啟該 Issue。
2. 點選 Description 旁的 Edit。
3. 更新「判斷問題原因」或「解決方式」。
4. 點選 Save changes。

也可以在下方留言區新增處理紀錄，例如：

```markdown
2026-07-14 14:30

已確認 CoreDNS 沒有異常，進一步檢查 NodeLocalDNS。
```

---

## 八、問題完成後關閉 Issue

問題處理完成後：

1. 確認「判斷問題原因」與「解決方式」已填寫完整。
2. 視需要加入：

   ```text
   狀態::已解決
   ```

3. 點選：

   ```text
   Close issue
   ```

關閉後仍然可以從 Closed 狀態中查詢，不會刪除資料。

---

## 九、建議使用規則

每一個問題建立一筆 Issue。

Issue 標題建議格式：

```text
[部門] 問題簡述
```

例如：

```text
[資訊部] Grafana Dashboard 無法開啟
[人資部] 內部系統登入失敗
[財務部] 報表匯出異常
```

建議至少使用以下分類：

```text
部門::資訊部
類型::Kubernetes
狀態::待處理
```

問題完成後改成：

```text
狀態::已解決
```

---

## 十、整體使用流程

```text
進入 GitLab 專案
→ Plan → Work items
→ New item
→ 選擇 Issue
→ 選擇部門範本
→ 填寫問題內容
→ 貼上問題截圖
→ Create issue
→ 處理及更新結果
→ 套用已解決標籤
→ Close issue
```
