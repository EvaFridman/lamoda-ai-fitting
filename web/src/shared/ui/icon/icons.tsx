import { createIcon } from './icon';

// Every drawing paints with currentColor. Strokes keep 1px when an icon drawn only at 24px is
// shown at 16px (non-scaling-stroke); MapPinIcon, BagIcon and ProfileIcon are drawn with fills, so
// at 16px their lines thin to about 0.7px.

export const ChevronDownIcon = createIcon('ChevronDownIcon', {
  16: <path d="M2 6l6 5 6-5" stroke="currentColor" />,
  24: <path d="M3 9l9 7 9-7" stroke="currentColor" />,
});

export const ChevronUpIcon = createIcon('ChevronUpIcon', {
  16: <path d="M2 10l6-5 6 5" stroke="currentColor" />,
  24: <path d="M3 15l9-7 9 7" stroke="currentColor" />,
});

// "‹": back to the previous screen of a sheet (the filters' sheet, spec 0020).
export const ChevronLeftIcon = createIcon('ChevronLeftIcon', {
  16: <path d="M10 2l-5 6 5 6" stroke="currentColor" />,
  24: <path d="M15 3l-7 9 7 9" stroke="currentColor" />,
});

// "›": the next cards of a row (`ScrollRow`, spec 0019 A87).
export const ChevronRightIcon = createIcon('ChevronRightIcon', {
  16: <path d="M6 2l5 6-5 6" stroke="currentColor" />,
  24: <path d="M9 3l7 9-7 9" stroke="currentColor" />,
});

export const ArrowForwardIcon = createIcon('ArrowForwardIcon', {
  16: <path d="M9 2l5 6.5L9 15M1 8.5h13" stroke="currentColor" />,
  24: <path d="M14 2.5l7 9-7 9M3 11.5h18" stroke="currentColor" />,
});

export const ArrowBackIcon = createIcon('ArrowBackIcon', {
  16: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.60364 8.19519L6.60364 1.69519L7.39627 2.3049L3.01539 8.00005H15V9.00005H3.01539L7.39627 14.6952L6.60364 15.3049L1.60364 8.8049L1.36914 8.50005L1.60364 8.19519Z"
      fill="currentColor"
    />
  ),
  24: <path d="M10 2.5l-7 9 7 9M21 11.5H3" stroke="currentColor" />,
});

export const CloseIcon = createIcon('CloseIcon', {
  16: <path d="M2 14L14 2M2 2l12 12" stroke="currentColor" />,
  24: <path d="M4 20L20 4M4 4l16 16" stroke="currentColor" />,
});

// A funnel: the phone catalog's "Фильтры" (spec 0020 W10).
export const FilterIcon = createIcon('FilterIcon', {
  24: (
    <path
      d="M3.5 4.5h17l-6.5 8v6l-4 2v-8z"
      stroke="currentColor"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  ),
});

export const SearchIcon = createIcon('SearchIcon', {
  24: (
    <path
      d="M20.5 20.5l-5-5M10.5 3a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z"
      stroke="currentColor"
      vectorEffect="non-scaling-stroke"
    />
  ),
});

// Hollow inside: the source's 24px heart was filled white. A heart over a photo needs its own
// backing.
export const HeartIcon = createIcon('HeartIcon', {
  16: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2.63803 3.8453C2.22627 4.3724 2 5.12918 2 6C2 8.15027 3.47927 10.0227 5.07711 11.4048C5.86446 12.0859 6.65422 12.6249 7.24821 12.9939C7.54468 13.1781 7.79104 13.3191 7.96218 13.4134C7.97523 13.4206 7.98784 13.4276 8 13.4342C8.01216 13.4276 8.02477 13.4206 8.03782 13.4134C8.20896 13.3191 8.45532 13.1781 8.75179 12.9939C9.34578 12.6249 10.1355 12.0859 10.9229 11.4048C12.5207 10.0227 14 8.15027 14 6C14 5.12918 13.7737 4.3724 13.362 3.8453C12.9622 3.3336 12.3599 3 11.5 3C10.9289 3 10.3004 3.32227 9.79767 3.84134C9.29283 4.36263 9 4.99455 9 5.5V6H8.5H8H7.5H7V5.5C7 4.99455 6.70717 4.36263 6.20233 3.84134C5.69963 3.32227 5.07111 3 4.5 3C3.64013 3 3.03776 3.3336 2.63803 3.8453ZM8 14C7.77665 14.4473 7.7765 14.4473 7.77632 14.4472L7.77584 14.4469L7.77444 14.4462L7.76987 14.4439L7.75381 14.4358C7.74008 14.4288 7.72036 14.4186 7.69505 14.4053C7.64443 14.3788 7.57143 14.3399 7.47923 14.2891C7.29489 14.1874 7.03345 14.0377 6.72054 13.8433C6.09578 13.4552 5.26054 12.8857 4.42289 12.1612C2.77073 10.732 1 8.6044 1 6C1 4.97082 1.26573 3.9776 1.84997 3.2297C2.44624 2.4664 3.34387 2 4.5 2C5.42622 2 6.2977 2.50239 6.92067 3.14566C7.41926 3.66048 7.81316 4.32175 7.94894 5H8H8.05106C8.18684 4.32175 8.58074 3.66048 9.07933 3.14566C9.7023 2.50239 10.5738 2 11.5 2C12.6561 2 13.5538 2.4664 14.15 3.2297C14.7343 3.9776 15 4.97082 15 6C15 8.6044 13.2293 10.732 11.5771 12.1612C10.7395 12.8857 9.90422 13.4552 9.27946 13.8433C8.96655 14.0377 8.70511 14.1874 8.52077 14.2891C8.42857 14.3399 8.35557 14.3788 8.30495 14.4053C8.27964 14.4186 8.25992 14.4288 8.24619 14.4358L8.23013 14.4439L8.22556 14.4462L8.22416 14.4469L8.22368 14.4472C8.2235 14.4473 8.22335 14.4473 8 14ZM8 14L8.22335 14.4473L8 14.5589L7.77665 14.4473L8 14Z"
      fill="currentColor"
    />
  ),
  24: (
    <path
      clipRule="evenodd"
      d="M12 7.5h.5c0-2.026 2.194-4 4.44-4 3.024 0 4.56 2.412 4.56 5.262C21.5 15.894 12 20.5 12 20.5S2.5 15.894 2.5 8.762C2.5 5.912 4.036 3.5 7.06 3.5c2.246 0 4.44 1.974 4.44 4h.5z"
      stroke="currentColor"
    />
  ),
});

export const HeartFilledIcon = createIcon('HeartFilledIcon', {
  16: (
    <path
      d="M7.47923 14.2891C7.29489 14.1874 7.03345 14.0377 6.72054 13.8433C6.09578 13.4552 5.26054 12.8857 4.42289 12.1612C2.77073 10.732 1 8.6044 1 6C1 4.97082 1.26573 3.9776 1.84997 3.2297C2.44624 2.4664 3.34387 2 4.5 2C5.42622 2 6.2977 2.50239 6.92067 3.14566C7.41926 3.66048 7.81316 4.32175 7.94894 5H8.05106C8.18684 4.32175 8.58074 3.66048 9.07933 3.14566C9.7023 2.50239 10.5738 2 11.5 2C12.6561 2 13.5538 2.4664 14.15 3.2297C14.7343 3.9776 15 4.97082 15 6C15 8.6044 13.2293 10.732 11.5771 12.1612C10.7395 12.8857 9.90422 13.4552 9.27946 13.8433C8.96655 14.0377 8.70511 14.1874 8.52077 14.2891C8.34943 14.3836 8 14.5589 8 14.5589C8 14.5589 7.65057 14.3836 7.47923 14.2891Z"
      fill="currentColor"
    />
  ),
  24: (
    <path
      d="M12 7.5h.5c0-2.026 2.194-4 4.44-4 3.024 0 4.56 2.412 4.56 5.262C21.5 15.894 12 20.5 12 20.5S2.5 15.894 2.5 8.762C2.5 5.912 4.036 3.5 7.06 3.5c2.246 0 4.44 1.974 4.44 4h.5z"
      fill="currentColor"
      stroke="currentColor"
    />
  ),
});

export const StarIcon = createIcon('StarIcon', {
  16: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M0.5 6.53719L0.681449 6H0.888955H1.46321H6L7.47291 1.58474L7.58483 1.24926L7.66798 1H8.33202L8.41517 1.24926L8.52709 1.58474L10 6H14.533H15.1129H15.3186L15.5 6.53416L15.3186 6.66567L14.8573 7L11.3183 9.56497L12.6838 13.9873L12.8108 14.3985L12.8797 14.6216L12.3811 15L12.1617 14.8433L11.8279 14.6049L8.00038 11.8708L4.17187 14.6056L3.83882 14.8435L3.61969 15L3.12033 14.6216L3.18947 14.3977L3.31597 13.988L4.6817 9.56497L1.13919 7L0.681449 6.66857L0.5 6.53719Z"
      fill="currentColor"
    />
  ),
  24: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15 9H22.9775L23.25 9.80078L16.9775 14.3477L19.3193 21.9326L18.5713 22.5L12.001 17.8066L5.42969 22.5L4.68066 21.9326L7.02246 14.3477L0.75 9.80566L1.02246 9H9L11.502 1.5H12.498L15 9Z"
      fill="currentColor"
    />
  ),
});

export const CheckIcon = createIcon('CheckIcon', {
  16: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13.9241 3.76498L8.92405 11.765L8.77718 12H8.50005H7.50005H7.25974L7.10962 11.8123L3.10962 6.81233L3.89049 6.18764L7.74037 11H8.22293L13.0761 3.23499L13.9241 3.76498Z"
      fill="currentColor"
    />
  ),
  24: <path d="M6 10l5.5 7.5h1l7-12" stroke="currentColor" />,
});

export const CartIcon = createIcon('CartIcon', {
  24: (
    <path
      d="M18.5 2.5h-13L3.747 18.28a2 2 0 0 0 1.988 2.22h12.53a2 2 0 0 0 1.988-2.22L18.5 2.5zM15.5 9a3.5 3.5 0 1 1-7 0m0-2V5m7 2V5"
      stroke="currentColor"
      vectorEffect="non-scaling-stroke"
    />
  ),
});

// Lamoda's cartWeb13940_24px: the bag with handles of the header's cart button. CartIcon is the
// cart drawn elsewhere on Lamoda.
export const BagIcon = createIcon('BagIcon', {
  24: (
    <path
      d="M12 1C13.1306 1.00003 14.1437 1.42751 14.8701 2.22656C15.5937 3.02275 16 4.15036 16 5.5V7H21.0371L20.999 7.53516L19.9658 22H4.03418L3.00098 7.53516L2.96289 7H8V5.5C8 4.15032 8.40622 3.02276 9.12988 2.22656C9.85632 1.42752 10.8694 1 12 1ZM4.96582 21H19.0342L19.9629 8H16V12H15V8H9V12H8V8H4.03711L4.96582 21ZM12 2C11.1308 2 10.3937 2.32274 9.87012 2.89844C9.34395 3.47723 9 4.34984 9 5.5V7H15V5.5C15 4.34988 14.656 3.47723 14.1299 2.89844C13.6064 2.32273 12.8692 2.00003 12 2Z"
      fill="currentColor"
    />
  ),
});

// Lamoda's profileWeb13940_normal_24px: the header's profile button.
export const ProfileIcon = createIcon('ProfileIcon', {
  24: (
    <path
      d="M11.999 2C15.0372 2 17.499 4.46186 17.499 7.5C17.499 9.22462 16.7043 10.763 15.4619 11.7715L21.7314 15.0576L22.1074 15.2549L21.9736 15.6582L21.9727 15.6592C21.9724 15.66 21.9722 15.6617 21.9717 15.6631C21.9707 15.666 21.9696 15.6704 21.9678 15.6758C21.9639 15.6874 21.9577 15.7053 21.9502 15.7275C21.9352 15.7722 21.913 15.8378 21.8848 15.9209C21.828 16.0876 21.7455 16.3263 21.6445 16.6152C21.4424 17.1934 21.1634 17.9744 20.8564 18.7822C20.5318 19.6363 20.1289 20.2294 19.5332 20.584C18.9516 20.93 18.2643 21 17.499 21H6.49902C5.73397 21 5.04645 20.9308 4.46484 20.585C3.86914 20.2306 3.4662 19.6377 3.1416 18.7832C2.83465 17.9751 2.55563 17.1944 2.35352 16.6162C2.25245 16.3271 2.17005 16.0877 2.11328 15.9209C2.08499 15.8378 2.06287 15.7722 2.04785 15.7275C2.04036 15.7053 2.03416 15.6874 2.03027 15.6758C2.02847 15.6704 2.02734 15.666 2.02637 15.6631C2.0259 15.6616 2.02564 15.6599 2.02539 15.6592L2.02441 15.6582L1.89062 15.2549L2.2666 15.0576L8.53516 11.7715C7.29325 10.763 6.49902 9.2242 6.49902 7.5C6.49902 4.46202 8.96111 2.00027 11.999 2ZM14.501 12.3975C13.7504 12.7816 12.9003 13 11.999 13C11.0975 12.9999 10.2468 12.7819 9.49609 12.3975L3.10938 15.7432C3.16005 15.8911 3.22318 16.0753 3.29688 16.2861C3.4972 16.8592 3.77329 17.6314 4.07617 18.4287C4.36141 19.1796 4.65421 19.5343 4.97559 19.7256C5.31125 19.9252 5.76452 20 6.49902 20H17.499C18.2332 20 18.6867 19.9244 19.0225 19.7246C19.3441 19.533 19.6367 19.178 19.9219 18.4277C20.2247 17.6308 20.5009 16.8581 20.7012 16.2852C20.7747 16.0748 20.8371 15.8909 20.8877 15.7432L14.501 12.3975ZM11.999 3C9.51339 3.00027 7.49902 5.01431 7.49902 7.5C7.49902 9.98476 9.51346 11.9997 11.999 12C14.4848 12 16.499 9.98492 16.499 7.5C16.499 5.01414 14.4849 3 11.999 3Z"
      fill="currentColor"
    />
  ),
});

export const ClockIcon = createIcon('ClockIcon', {
  16: (
    <path
      d="M7.5 4V7.99999L11.5 11.5M8.00008 14.5C3 14.5 1.5 13 1.5 7.99999C1.5 3 3.00016 1.5 8.00008 1.5C13 1.5 14.5 3 14.5 7.99999C14.5 13 13.0002 14.5 8.00008 14.5Z"
      stroke="currentColor"
    />
  ),
  24: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4.92748 4.94821C3.59205 6.29282 3 8.49848 3 12.0296C3 15.5611 3.59224 17.7503 4.92572 19.0796C6.25966 20.4094 8.45678 21 12 21C15.5441 21 17.7412 20.4094 19.0749 19.0797C20.4082 17.7504 21 15.5612 21 12.0296C21 8.4984 20.4084 6.29277 19.0731 4.94819C17.7388 3.60451 15.5417 3 12 3C8.45925 3 6.26203 3.60449 4.92748 4.94821ZM4.21796 4.24353C5.84855 2.60173 8.40133 2 12 2C15.5995 2 18.1523 2.60172 19.7827 4.24356C21.4122 5.88449 22 8.44366 22 12.0296C22 15.6152 21.4124 18.1612 19.781 19.7878C18.15 21.414 15.597 22 12 22C8.4038 22 5.85092 21.414 4.21972 19.7878C2.58806 18.1613 2 15.6152 2 12.0296C2 8.44358 2.58824 5.88444 4.21796 4.24353ZM11 12V6H12V11.7929L16.8536 16.6464L16.1464 17.3536L11.1464 12.3536L11 12.2071V12Z"
      fill="currentColor"
    />
  ),
});

export const MapPinIcon = createIcon('MapPinIcon', {
  24: (
    <path
      fill="currentColor"
      d="M12.5 22.5v.5h.332l.129-.305-.46-.195zm-1 0l-.46.196.13.304h.33v-.5zm1.46.195c1.16-2.735 2.868-5.001 4.344-7.224C18.756 13.282 20 11.11 20 8.684h-1c0 2.095-1.074 4.04-2.53 6.234-1.432 2.159-3.224 4.54-4.43 7.387l.92.39zM20 8.685C20 4.472 16.832 1 12 1v1c4.28 0 7 3.026 7 6.684h1zM12 1C7.169 1 4 4.473 4 8.684h1C5 5.026 7.72 2 12 2V1zM4 8.684c0 2.4 1.242 4.573 2.692 6.767 1.474 2.229 3.184 4.509 4.348 7.245l.92-.392c-1.21-2.844-3-5.239-4.434-7.404C6.071 12.697 5 10.753 5 8.684H4zM11.5 23h1v-1h-1v1zm.5-10c-1.665 0-2.612-.281-3.165-.833C8.28 11.616 8 10.673 8 9.014H7c0 1.713.277 3.013 1.128 3.861C8.98 13.724 10.282 14 12 14v-1zM8 9.014c0-1.658.281-2.61.836-3.169C9.39 5.287 10.338 5 12 5V4c-1.72 0-3.023.284-3.873 1.14C7.277 5.997 7 7.302 7 9.015h1zM12 5c1.662 0 2.61.287 3.164.845.555.56.836 1.511.836 3.17h1c0-1.714-.277-3.02-1.127-3.874C15.023 4.284 13.72 4 12 4v1zm4 4.014c0 1.659-.281 2.602-.835 3.153-.553.552-1.5.833-3.165.833v1c1.718 0 3.02-.276 3.872-1.125.85-.848 1.128-2.148 1.128-3.86h-1z"
    />
  ),
});

export const InfoIcon = createIcon('InfoIcon', {
  16: (
    <>
      <path
        d="M8 14.5c-4.885 0-6.5-1.61-6.5-6.48S3.115 1.5 8 1.5c4.886 0 6.5 1.65 6.5 6.52 0 4.87-1.614 6.48-6.5 6.48"
        stroke="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 4H7v2h2V4zm0 3H7v5h2V7z"
        fill="currentColor"
      />
    </>
  ),
  24: (
    <>
      <path
        d="M12 21.5c-7.14 0-9.5-2.353-9.5-9.47C2.5 4.912 4.86 2.5 12 2.5c7.141 0 9.5 2.412 9.5 9.53 0 7.117-2.359 9.47-9.5 9.47"
        stroke="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13 6h-2v2h2V6zm0 4h-2v8h2v-8z"
        fill="currentColor"
      />
    </>
  ),
});

export const PlusIcon = createIcon('PlusIcon', {
  16: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.5 7.5V1H8.5V7.5H15V8.5H8.5V15H7.5V8.5H1V7.5H7.5Z"
      fill="currentColor"
    />
  ),
  24: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M11.5 11.5V3H12.5V11.5H21V12.5H12.5V21H11.5V12.5H3V11.5H11.5Z"
      fill="currentColor"
    />
  ),
});

// Lamoda's socials_vk_24px (drawn on a 25px-wide canvas, 0.5px right of centre here); Lamoda paints
// it VK blue, which the footer sets as the text colour (--color-vk).
export const VkIcon = createIcon('VkIcon', {
  24: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M1.5 12.0342C1.5 20.2753 4.23295 23 12.5 23C20.7674 23 23.5 20.2753 23.5 12.0342C23.5 3.79271 20.7674 1 12.5 1C4.23295 1 1.5 3.79271 1.5 12.0342ZM5.21748 7.70111C5.33429 13.4206 8.34514 16.862 13.3056 16.862H13.5932V13.5898C15.3988 13.7731 16.747 15.1214 17.297 16.862H19.9009C19.1943 14.2582 17.362 12.8187 16.2238 12.2687C17.362 11.5878 18.9717 9.93883 19.3509 7.70111H16.9828C16.4846 9.51978 15.0064 11.1687 13.5932 11.3259V7.70111H11.1847V14.0486C9.71962 13.6851 7.80824 11.9021 7.72967 7.70111H5.21748Z"
      fill="currentColor"
    />
  ),
});

// Lamoda's phone_24px: a handset, next to "Мобильная версия" in the footer.
export const PhoneIcon = createIcon('PhoneIcon', {
  24: (
    <path
      d="M17.5 5.5H9M17.5 5.5V20.5C17.5 21.0523 17.0523 21.5 16.5 21.5H7.5C6.94771 21.5 6.5 21.0523 6.5 20.5V3.5C6.5 2.94771 6.94772 2.5 7.5 2.5H16.5C17.0523 2.5 17.5 2.94772 17.5 3.5V5.5ZM17.5 18.5H6.5"
      stroke="currentColor"
      vectorEffect="non-scaling-stroke"
    />
  ),
});

// The fitting's icons (spec 0019 plan §7): drawn at 24px only, in 1px lines that stay 1px at 16px.
function lineArt(d: string) {
  return {
    24: <path d={d} stroke="currentColor" vectorEffect="non-scaling-stroke" />,
  };
}

// A coat hanger: the fitting room.
export const HangerIcon = createIcon(
  'HangerIcon',
  lineArt('M10 5.5a2 2 0 1 1 2 2v2l8.6 6.6c.6.5.3 1.4-.5 1.4H3.9c-.8 0-1.1-.9-.5-1.4L12 9.5'),
);

// A four-pointed star and a small one: a generated image.
export const SparkleIcon = createIcon(
  'SparkleIcon',
  lineArt('M10 4.5l1.7 5.3 5.3 1.7-5.3 1.7L10 18.5l-1.7-5.3L3 11.5l5.3-1.7zM18 2.5v4M16 4.5h4'),
);

export const CameraIcon = createIcon(
  'CameraIcon',
  lineArt('M2.5 7.5h4.5l1.5-2.5h7l1.5 2.5h4.5v12h-19zM12 9.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z'),
);

export const UploadIcon = createIcon(
  'UploadIcon',
  lineArt('M12 15.5v-12M7 8.5l5-5 5 5M3.5 15v5.5h17V15'),
);

export const DownloadIcon = createIcon(
  'DownloadIcon',
  lineArt('M12 3.5v12M7 10.5l5 5 5-5M3.5 15v5.5h17V15'),
);

export const FullscreenIcon = createIcon(
  'FullscreenIcon',
  lineArt('M3.5 9V3.5H9M15 3.5h5.5V9M20.5 15v5.5H15M9 20.5H3.5V15'),
);

// A circular arrow: generate again.
export const RefreshIcon = createIcon(
  'RefreshIcon',
  lineArt('M20 12a8 8 0 1 1-2.3-5.7M20.5 3.5V8H16'),
);

export const LockIcon = createIcon(
  'LockIcon',
  lineArt('M5.5 10.5h13v10h-13zM8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5M12 14v3'),
);

// Two frames side by side with a line between them: compare two fittings.
export const CompareIcon = createIcon(
  'CompareIcon',
  lineArt('M12 2v20M3.5 5.5h5v13h-5zM15.5 5.5h5v13h-5z'),
);

// Three dots in a row: a card's actions menu (spec 0019 board 9).
export const MoreIcon = createIcon('MoreIcon', {
  24: (
    <path
      d="M5 10.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM12 10.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM19 10.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"
      fill="currentColor"
    />
  ),
});

// A bin with its lid: delete (spec 0019 board 10).
export const TrashIcon = createIcon('TrashIcon', lineArt('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'));

// The 24px minus is the plus's horizontal bar at 24px.
export const MinusIcon = createIcon('MinusIcon', {
  16: <path fillRule="evenodd" clipRule="evenodd" d="M15 8.5H1V7.5H15V8.5Z" fill="currentColor" />,
  24: (
    <path fillRule="evenodd" clipRule="evenodd" d="M21 12.5H3V11.5H21V12.5Z" fill="currentColor" />
  ),
});
