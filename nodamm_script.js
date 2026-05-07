/* ── 0. Lenis Smooth Scroll 초기화 ── */
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  orientation: 'vertical',
  gestureOrientation: 'vertical',
  smoothWheel: true,
  wheelMultiplier: 1,
  smoothTouch: false,
  touchMultiplier: 2,
  infinite: false,
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}

requestAnimationFrame(raf);

// Anchor link smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = this.getAttribute('href');
    if (target === '#') return;
    lenis.scrollTo(target);
  });
});

/* ── 1. 스크롤 페이드인 ── */
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

    /* ── 2. 숫자 카운터 애니메이션 ── */
    function countUp(id, target, suffix) {
      const el = document.getElementById(id);
      if (!el) return;
      let current = 0;
      const step = Math.ceil(target / 50);
      const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current.toLocaleString() + (suffix || '');
        if (current >= target) clearInterval(timer);
      }, 35);
    }

    const statsObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          countUp('s1', 10000, '');
          countUp('s2', 10, '');
          countUp('s3', 1, 'H');
          countUp('s4', 15, '');
          statsObserver.disconnect();
        }
      });
    }, { threshold: 0.3 });

    const detailSection = document.getElementById('detail');
    if (detailSection) statsObserver.observe(detailSection);

    /* ── 3. 게시판 데이터 & 렌더링 ── */
    const BADGE = {
      join: { label: '참여신청', cls: 'badge-join' },
      q: { label: '질문', cls: 'badge-q' },
      review: { label: '후기', cls: 'badge-review' },
    };

    let posts = [
      { type: 'join', region: '부평구', title: '저도 함께하고 싶어요! 신청합니다 😊', date: '2025.07.01' },
      { type: 'q', region: '연수구', title: '봉사시간 인증은 어떻게 받나요?', date: '2025.06.29' },
      { type: 'join', region: '부평구', title: '부평 지역으로 신청하고 싶습니다!', date: '2025.06.27' },
      { type: 'q', region: '남동구', title: '장갑이나 집게는 제공되나요?', date: '2025.06.25' },
      { type: 'join', region: '남동구', title: '인천 남동구에서 팀장 맡고 싶습니다.', date: '2025.06.23' },
    ];

    let currentFilter = 'all';
    let currentRegion = 'all';

    function renderPosts() {
      const list = document.getElementById('board-list');
      const countEl = document.getElementById('post-count');
      
      const filtered = posts.filter(p => {
          const matchType = currentFilter === 'all' || p.type === currentFilter;
          const matchRegion = currentRegion === 'all' || p.region === currentRegion;
          return matchType && matchRegion;
      });

      countEl.textContent = posts.length;

      if (filtered.length === 0) {
        list.innerHTML = '<li class="empty-msg">일치하는 게시글이 없습니다. 첫 번째로 남겨보세요!</li>';
        return;
      }

      list.innerHTML = filtered.map(p => {
        const b = BADGE[p.type];
        return `
          <li class="board-item">
            <div class="item-left">
              <span class="badge ${b.cls}" style="margin-right:4px;">${b.label}</span>
              <span class="badge badge-region" style="background:#f3f4f6; color:#4b5563; font-weight:400;">${p.region}</span>
              <span class="item-title" style="margin-left:8px;">${escapeHtml(p.title)}</span>
            </div>
            <span class="item-date">${p.date}</span>
          </li>`;
      }).join('');
    }

    function filterPosts(btn, filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPosts();
    }

    function filterRegion(region) {
        currentRegion = region;
        renderPosts();
    }

    function addPost() {
      const input = document.getElementById('post-text');
      const typeEl = document.getElementById('post-type');
      const regionEl = document.getElementById('post-region');
      const text = input.value.trim();
      if (!text) { input.focus(); return; }

      const today = new Date();
      const date = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
      posts.unshift({ 
          type: typeEl.value, 
          region: regionEl.value, 
          title: text, 
          date 
      });
      input.value = '';
      renderPosts();
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    document.getElementById('post-text').addEventListener('keydown', e => {
      if (e.key === 'Enter') addPost();
    });

    /* 초기 렌더링 */
    renderPosts();

    /* ── 4. 스크롤 네비게이션 숨김/표시 ── */
    let lastScroll = 0;
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
      const currentScroll = window.scrollY;
      if (currentScroll > lastScroll && currentScroll > 60) {
        navbar.classList.add('nav-hidden');
      } else {
        navbar.classList.remove('nav-hidden');
      }
      lastScroll = currentScroll;
    });

    /* ── 5. 카카오 지도 연동 ── */
    const hotspots = [
      { title: '부평 테마거리', lat: 37.491, lng: 126.724, count: 1200 },
      { title: '구월동 로데오', lat: 37.445, lng: 126.702, count: 850 },
      { title: '송도 센트럴파크', lat: 37.393, lng: 126.642, count: 420 },
      { title: '주안역 앞', lat: 37.465, lng: 126.680, count: 980 }
    ];

    function initMap() {
      if (typeof kakao === 'undefined' || !kakao.maps) {
        console.warn('Kakao Maps API가 로드되지 않았습니다. API 키를 확인해주세요.');
        return;
      }
      const container = document.getElementById('map');
      const options = {
        center: new kakao.maps.LatLng(37.456, 126.705), // 인천 시청 중심
        level: 8
      };
      const map = new kakao.maps.Map(container, options);

      hotspots.forEach(spot => {
        const marker = new kakao.maps.Marker({
          map: map,
          position: new kakao.maps.LatLng(spot.lat, spot.lng)
        });

        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:5px; font-size:12px; color:#333;"><b>${spot.title}</b><br>누적 수거량: ${spot.count}개</div>`
        });

        kakao.maps.event.addListener(marker, 'mouseover', () => infowindow.open(map, marker));
        kakao.maps.event.addListener(marker, 'mouseout', () => infowindow.close());
      });
    }

    // API 로드 후 실행 (SDK가 비동기로 로드될 수 있으므로 static 방식 사용 시에도 체크 필요)
    window.addEventListener('load', initMap);