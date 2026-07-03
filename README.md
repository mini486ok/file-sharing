# 📮 파일 우체국 (File Post Office)

드래그 앤 드랍으로 파일을 업로드/다운로드하는 파일 공유 웹페이지입니다.
GitHub Pages로 호스팅되며, 이 저장소 자체를 파일 스토리지로 사용합니다.

**▶ 사이트 주소: https://mini486ok.github.io/file-sharing/**

## 기능

- **업로드**: 페이지에 파일을 드래그 앤 드랍하거나, `파일 선택해서 부치기` 버튼으로 여러 파일을 동시에 업로드 (진행률 표시)
- **다운로드**: 목록에서 `다운로드` 버튼 클릭, 또는 파일을 **바탕화면으로 드래그 앤 드랍** (Chrome/Edge 지원)
- **삭제**: 두 번 클릭으로 안전하게 삭제
- 업로드된 파일은 이 저장소의 [`files/`](./files) 폴더에 커밋으로 저장됩니다

## 사용 방법

1. https://mini486ok.github.io/file-sharing/ 접속
2. **다운로드만** 할 거라면 그대로 사용하면 됩니다 (토큰 불필요)
3. **업로드/삭제**하려면 우측 상단 `🔑 토큰 설정`에서 GitHub 토큰을 등록하세요:
   - [Fine-grained token 발급](https://github.com/settings/personal-access-tokens/new)
   - Repository access → **Only select repositories** → `file-sharing`
   - Permissions → **Contents → Read and write**
   - 토큰은 브라우저 localStorage에만 저장되며 외부로 전송되지 않습니다 (GitHub API 호출 제외)

## 제한 사항

- 파일당 최대 **100MB** (GitHub 제한). 수십 MB 이상의 큰 파일은 업로드가 느리거나 실패할 수 있습니다
- 이 저장소는 **공개(public)** 상태이므로 업로드한 파일은 누구나 볼 수 있습니다. 민감한 파일은 올리지 마세요
- 저장소 권장 용량은 1GB 이내입니다

## 구조

```
index.html      # 페이지
css/style.css   # 스타일 (항공우편 콘셉트)
js/app.js       # GitHub Contents API 연동 로직
files/          # 업로드된 파일 저장 위치 (자동 생성)
```
