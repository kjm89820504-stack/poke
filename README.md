# Pika Runner

피카츄 이미지로 플레이하는 5스테이지 장애물 달리기 게임입니다. 기본 설정은 스테이지당 300초, 총 5스테이지입니다.

## 구성

- `index.html`, `styles.css`, `game.js`: 캔버스 게임 본체
- `assets/pikachu.png`: 사용자가 제공한 캐릭터 이미지 위치
- `firebase-client.js`, `firebase-config.js`: Firebase Firestore 이벤트 기록
- `firebase.json`, `firestore.rules`: Firebase 설정
- `vercel.json`: Vercel 정적 배포 설정

## 이미지 추가

제공한 이미지를 아래 경로로 저장하세요.

```text
assets/pikachu.png
```

투명 배경 PNG가 가장 자연스럽습니다. 검은 배경 이미지도 게임 시작 시 검은 픽셀을 투명 처리합니다. 공개 GitHub 저장소에 올릴 때는 이미지 사용 권한을 확인하세요.

## 로컬 실행

Python이 있으면 프로젝트 폴더에서 바로 실행할 수 있습니다.

```bash
python -m http.server 5173
```

브라우저에서 `http://localhost:5173`을 엽니다.

테스트 시간을 줄이고 싶으면 URL에 `?stageSeconds=20`을 붙이면 됩니다. 배포 기본값은 300초입니다.

## Firebase 연결

1. Firebase 콘솔에서 웹 앱을 만들고 Firestore를 활성화합니다.
2. `firebase-config.example.js` 내용을 참고해서 `firebase-config.js`에 실제 웹 앱 설정을 넣습니다.
3. Firebase CLI를 설치하고 로그인한 뒤 `.firebaserc.example`을 `.firebaserc`로 복사해 프로젝트 ID를 바꿉니다.
4. Firestore 규칙과 인덱스를 배포합니다.

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

게임은 `runs` 컬렉션에 스테이지 시작, 성공, 실패, 전체 클리어 이벤트를 기록합니다.

## Vercel 배포

GitHub에 이 폴더 내용을 올린 뒤 Vercel에서 저장소를 Import 하면 됩니다. 프레임워크 프리셋은 Other/Static으로 두고 별도 빌드 명령 없이 배포할 수 있습니다.
