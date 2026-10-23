import type { ReactNode } from 'react';

// The canvas's seven example "photos" of board 4 (spec 0019 A62, the assets 12f5a6ba…, cf994a3d…,
// ea627c52…, 39c27dbd…, 8bf2d6f8…, b258266e…, c633502c…, in the order of the tips), drawn as they
// are there: vector pictures at 3:4 that fill their frame, inline because web keeps no files of
// its own. Decorative: the tip's caption says what each shows.

function Pictogram({ children }: { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 400"
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden
      focusable={false}
    >
      {children}
    </svg>
  );
}

// The head, the same in every picture: `long` adds the hair down to the shoulders behind it.
function Head({ skin, hair, long = false }: { skin: string; hair: string; long?: boolean }) {
  return (
    <>
      {long && (
        <path d="M124 64 Q122 40 150 36 Q178 40 176 64 L182 132 Q150 142 118 132 Z" fill={hair} />
      )}
      <rect x="143" y="84" width="14" height="16" fill={skin} />
      <ellipse cx="150" cy="66" rx="21" ry="25" fill={skin} />
      <path d="M128 62 Q130 38 150 38 Q172 38 172 62 Q160 50 150 52 Q138 50 128 62Z" fill={hair} />
    </>
  );
}

// The room of «Слишком темно» and «Не в полный рост»: a beige wall, a wooden floor, one person.
function BeigeRoom() {
  return (
    <>
      <rect width="300" height="400" fill="#e9d8c6" />
      <rect y="320" width="300" height="80" fill="#c99d6e" />
      <line x1="0" y1="320" x2="300" y2="320" stroke="#b58a5e" strokeWidth="3" />
      <Head skin="#e9c3a6" hair="#4a3426" long />
      <rect x="125.25" y="214" width="19.55" height="128" rx="7" fill="#e9c3a6" />
      <rect x="155.2" y="214" width="19.55" height="128" rx="7" fill="#e9c3a6" />
      <rect x="121.25" y="336" width="29.55" height="12" rx="5" fill="#222" />
      <rect x="153.2" y="336" width="29.55" height="12" rx="5" fill="#222" />
      <rect x="85.1" y="104" width="16.1" height="112" rx="7" fill="#e9c3a6" />
      <rect x="200.6" y="104" width="16.1" height="112" rx="7" fill="#e9c3a6" />
      <path
        d="M92.5 200 L207.5 200 L205.5 334 L152 334 L150 236 L148 334 L94.5 334Z"
        fill="#5b6f8a"
      />
      <path
        d="M97.1 100 L202.9 100 L216.9 130 L202.9 136 L200.9 206 L99.1 206 L97.1 136 L83.1 130Z"
        fill="#7f8c99"
      />
    </>
  );
}

/** «В полный рост, хороший свет». */
export function FullLengthPictogram() {
  return (
    <Pictogram>
      <rect width="300" height="400" fill="#f3f1ee" />
      <rect y="330" width="300" height="70" fill="#e2dcd4" />
      <Head skin="#c99877" hair="#1e1612" long />
      <rect x="120.25" y="214" width="22.95" height="128" rx="7" fill="#c99877" />
      <rect x="156.8" y="214" width="22.95" height="128" rx="7" fill="#c99877" />
      <rect x="116.25" y="336" width="32.95" height="12" rx="5" fill="#222" />
      <rect x="154.8" y="336" width="32.95" height="12" rx="5" fill="#222" />
      <rect x="75.9" y="104" width="18.9" height="112" rx="7" fill="#c99877" />
      <rect x="209.4" y="104" width="18.9" height="112" rx="7" fill="#c99877" />
      <path
        d="M82.5 200 L217.5 200 L215.5 334 L152 334 L150 236 L148 334 L84.5 334Z"
        fill="#4f5f78"
      />
      <path
        d="M87.9 100 L212.1 100 L226.1 130 L212.1 136 L210.1 206 L89.9 206 L87.9 136 L73.9 130Z"
        fill="#8a8f7a"
      />
    </Pictogram>
  );
}

/** «Простая или облегающая одежда, лицом к камере». */
export function FittedClothesPictogram() {
  return (
    <Pictogram>
      <rect width="300" height="400" fill="#ececec" />
      <rect y="330" width="300" height="70" fill="#dedede" />
      <Head skin="#8d5e43" hair="#140e0b" />
      <rect x="130.25" y="214" width="16.15" height="128" rx="7" fill="#8d5e43" />
      <rect x="153.6" y="214" width="16.15" height="128" rx="7" fill="#8d5e43" />
      <rect x="126.25" y="336" width="26.15" height="12" rx="5" fill="#222" />
      <rect x="151.6" y="336" width="26.15" height="12" rx="5" fill="#222" />
      <rect x="94.3" y="104" width="13.3" height="112" rx="7" fill="#8d5e43" />
      <rect x="191.8" y="104" width="13.3" height="112" rx="7" fill="#8d5e43" />
      <path
        d="M102.5 200 L197.5 200 L195.5 334 L152 334 L150 236 L148 334 L104.5 334Z"
        fill="#3d3d3d"
      />
      <path
        d="M106.3 100 L193.7 100 L207.7 130 L193.7 136 L191.7 206 L108.3 206 L106.3 136 L92.3 130Z"
        fill="#e4e1da"
      />
    </Pictogram>
  );
}

/** «Слишком темно»: the beige room under a dark veil. */
export function TooDarkPictogram() {
  return (
    <Pictogram>
      <BeigeRoom />
      <rect width="300" height="400" fill="#000" opacity=".72" />
    </Pictogram>
  );
}

/** «Не в полный рост»: the beige room at twice the size, cut at the knees. */
export function NotFullLengthPictogram() {
  return (
    <Pictogram>
      <g transform="translate(-150,-40) scale(2)">
        <BeigeRoom />
      </g>
    </Pictogram>
  );
}

/** «Больше одного человека»: two people in a street. */
export function ManyPeoplePictogram() {
  return (
    <Pictogram>
      <rect width="300" height="400" fill="#d6dde3" />
      <rect y="300" width="300" height="100" fill="#a7a9aa" />
      <rect x="20" y="120" width="70" height="180" fill="#c4ccd2" />
      <rect x="210" y="90" width="80" height="210" fill="#bec6cc" />
      <g transform="translate(95,30) scale(0.9) translate(-150,0)">
        <Head skin="#f1d2bd" hair="#3b2a20" long />
        <rect x="129" y="214" width="17" height="128" rx="7" fill="#f1d2bd" />
        <rect x="154" y="214" width="17" height="128" rx="7" fill="#f1d2bd" />
        <rect x="125" y="336" width="27" height="12" rx="5" fill="#222" />
        <rect x="152" y="336" width="27" height="12" rx="5" fill="#222" />
        <rect x="92" y="104" width="14" height="112" rx="7" fill="#f1d2bd" />
        <rect x="194" y="104" width="14" height="112" rx="7" fill="#f1d2bd" />
        <path d="M100 200 L200 200 L198 334 L152 334 L150 236 L148 334 L102 334Z" fill="#5b6f8a" />
        <path
          d="M104 100 L196 100 L210 130 L196 136 L194 206 L106 206 L104 136 L90 130Z"
          fill="#7f8c99"
        />
      </g>
      <g transform="translate(205,30) scale(0.9) translate(-150,0)">
        <Head skin="#c99877" hair="#222" long />
        <rect x="122.75" y="214" width="21.25" height="128" rx="7" fill="#c99877" />
        <rect x="156" y="214" width="21.25" height="128" rx="7" fill="#c99877" />
        <rect x="118.75" y="336" width="31.25" height="12" rx="5" fill="#222" />
        <rect x="154" y="336" width="31.25" height="12" rx="5" fill="#222" />
        <rect x="80.5" y="104" width="17.5" height="112" rx="7" fill="#c99877" />
        <rect x="205" y="104" width="17.5" height="112" rx="7" fill="#c99877" />
        <path
          d="M87.5 200 L212.5 200 L210.5 334 L152 334 L150 236 L148 334 L89.5 334Z"
          fill="#5b6f8a"
        />
        <path
          d="M92.5 100 L207.5 100 L221.5 130 L207.5 136 L205.5 206 L94.5 206 L92.5 136 L78.5 130Z"
          fill="#7a5c5c"
        />
      </g>
    </Pictogram>
  );
}

/** «Дети на фото»: an adult and a child. */
export function ChildPictogram() {
  return (
    <Pictogram>
      <rect width="300" height="400" fill="#f3f1ee" />
      <rect y="330" width="300" height="70" fill="#e2dcd4" />
      <g transform="translate(110,16) scale(0.95) translate(-150,0)">
        <Head skin="#e9c3a6" hair="#3b2a20" long />
        <rect x="126.5" y="214" width="18.7" height="128" rx="7" fill="#e9c3a6" />
        <rect x="154.8" y="214" width="18.7" height="128" rx="7" fill="#e9c3a6" />
        <rect x="122.5" y="336" width="28.7" height="12" rx="5" fill="#222" />
        <rect x="152.8" y="336" width="28.7" height="12" rx="5" fill="#222" />
        <rect x="87.4" y="104" width="15.4" height="112" rx="7" fill="#e9c3a6" />
        <rect x="198.4" y="104" width="15.4" height="112" rx="7" fill="#e9c3a6" />
        <path d="M95 200 L205 200 L203 334 L152 334 L150 236 L148 334 L97 334Z" fill="#5b6f8a" />
        <path
          d="M99.4 100 L200.6 100 L214.6 130 L200.6 136 L198.6 206 L101.4 206 L99.4 136 L85.4 130Z"
          fill="#7f8c99"
        />
      </g>
      <g transform="translate(210,176) scale(0.55) translate(-150,0)">
        <Head skin="#f1d2bd" hair="#8a6a3a" />
        <rect x="134" y="214" width="13.6" height="128" rx="7" fill="#f1d2bd" />
        <rect x="152.4" y="214" width="13.6" height="128" rx="7" fill="#f1d2bd" />
        <rect x="130" y="336" width="23.6" height="12" rx="5" fill="#222" />
        <rect x="150.4" y="336" width="23.6" height="12" rx="5" fill="#222" />
        <rect x="101.2" y="104" width="11.2" height="112" rx="7" fill="#f1d2bd" />
        <rect x="185.2" y="104" width="11.2" height="112" rx="7" fill="#f1d2bd" />
        <path d="M110 200 L190 200 L188 334 L152 334 L150 236 L148 334 L112 334Z" fill="#5b6f8a" />
        <path
          d="M113.2 100 L186.8 100 L200.8 130 L186.8 136 L184.8 206 L115.2 206 L113.2 136 L99.2 130Z"
          fill="#e7b44c"
        />
      </g>
    </Pictogram>
  );
}

/** «Объёмная одежда скрывает фигуру»: a long open coat. */
export function BulkyClothesPictogram() {
  return (
    <Pictogram>
      <rect width="300" height="400" fill="#f3f1ee" />
      <rect y="330" width="300" height="70" fill="#e2dcd4" />
      <Head skin="#e9c3a6" hair="#3b2a20" long />
      <rect x="125.25" y="214" width="19.55" height="128" rx="7" fill="#e9c3a6" />
      <rect x="155.2" y="214" width="19.55" height="128" rx="7" fill="#e9c3a6" />
      <rect x="121.25" y="336" width="29.55" height="12" rx="5" fill="#222" />
      <rect x="153.2" y="336" width="29.55" height="12" rx="5" fill="#222" />
      <rect x="85.1" y="104" width="16.1" height="112" rx="7" fill="#e9c3a6" />
      <rect x="200.6" y="104" width="16.1" height="112" rx="7" fill="#e9c3a6" />
      <path d="M92.5 198 L207.5 198 L227.5 300 L72.5 300Z" fill="#6b5a8a" />
      <path
        d="M97.1 100 L202.9 100 L216.9 130 L202.9 136 L200.9 206 L99.1 206 L97.1 136 L83.1 130Z"
        fill="#5a4a7a"
      />
      <path d="M91.1 96 L144 120 L136 300 L85.1 300 Z" fill="#6b5a8a" stroke="#00000022" />
      <path d="M208.9 96 L156 120 L164 300 L214.9 300 Z" fill="#6b5a8a" stroke="#00000022" />
      <rect x="73.1" y="100" width="18.4" height="114" rx="7" fill="#6b5a8a" />
      <rect x="210.9" y="100" width="18.4" height="114" rx="7" fill="#6b5a8a" />
    </Pictogram>
  );
}
