# The owner's Agentation notes (2026-10-29)

Copied from Agentation's "Copy" markdown as the owner pasted it. The `Location` lines are CSS
selectors of one render and are not used (the owner's instruction of spec 0023); the notes are
matched to the React components and texts. The block of `/customer/fittings` was pasted twice;
the second copy, which holds the first's two notes and four more, is kept. Ids used by the spec:
`R1`–`R14` the look result's window on a product page, `K1`–`K4` the catalog page, `T1`–`T14` the
try-on window, the header and the fitting room on a product page, `H1`–`H6` the history page
and the result's window opened from it, `S1`–`S3` the stores page, `D1` the drop zone on a product
page.

## Page Feedback: /products/01a11854-a6b9-7276-8c79-75de3d760cc6

**Viewport:** 1386×868

### R1. `<ProductPurchase> <ProductBuyBox> <Button> <Button>` button "Примерить"

Нужно сделать кнопку какого-то secondary цвета, типа серой, чтобы не выделалась больше, чем кнопка
в корзину, но и не выглядела как disabled. На всех страницах товаров, не только на этой.

### R2. `<ProductGallery> <Gallery>` ul

Добавить более плавное листание фоток, открытых на фулл скрин.

### R3. `<FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <LookResult> <ResultTiles>` button "Экран"

убрать эту кнопку и сделать функцию открытия на весь экран по нажатию на фотографию, и добавить
крестик, чтобы закрывать фотографию, открытую на полный экран.

### R4. `<FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <LookResult> <ResultTiles>` button "Скачать"

убираем эту кнопку отсюда, переносим её на фото (результат генерации). Отображаться она должна при
наведении на фото, пусть будет только иконка, без надписи, а надпись пусть отображается при
наведении на иконку как тултип пусть появляется. С кнопкой поделиться делаем то же самое и делаем
реально работающий функционал поделиться.

### R5. `<DialogPortal> <FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <LookResult>` look result

В мобильной версии пусть полноценные карточки товаров отображаются, как в десктопной

### R6. `<DialogPortal> <FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <LookResult>` paragraph: "Изображение приблизительное, могут быть ..."

эту надпись отсюда убираем, переносим в тултип с восклицетельным знаком после надписи выше (про
то, что сохранено в мои примерки)

### R7. `<FloatingFocusManager> <LookResult> <LookItemRow> <CartStubButton> <Button> <Button>` button "В корзину"

поднять выше, сердечко тоже, и выровная их относительно друг друга.

### R8. `<FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <LookResult> <LookItemRow>` "один цвет"

Если цвет один, то не пишет это вообще

### R9. `<DialogPortal> <FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <LookResult>` paragraph: "Смена цвета одной вещи перегенерирует ве..."

если цвет один, то не пишем это вообще

### R10. `<DialogPortal> <FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <LookResult>` look result

кнопку добавить в избранное сделать просто сердечком сбоку от кнопки в корзиу, и при наведении
пусть появляется тултип о том, что добавятся все вещи из образа

### R11. 6 elements: image, button "Добавить образ в корзину", button "Добавить образ в избранно", button "Хотите что-то поменять в ", button "Заменить вещь в примерочн" +1 more

весь блок кнопок выравниваем по низу

### R12. 1 elements: image

на экране процесса генерации нужно уменьшить текст, который появляется напротип процентов
выполнения генерации, потому что иногда на мобильной версии он залезает на проценты. Также на этом
же экране надо увеличить превьюшки примеряемых вещей. и на мобильной верссии на этом экране на
кнопке свернуть заменить текста на тот же, который в десктопной версии. сам экран процесса
генерации показывать оптимистично, даже если мы ещё не начали генерацию пусть пользователь думает,
что начали.

### R13. `<DialogPortal> <FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <DialogTitle>` h2 "Что поменять?"

пусть весь тот функционал появляется не в модалке, в поп-апом или как-то так вылезает на самой
странице с результатом генераии. пусть просто вверх выползает на кнопкой, а весь остальной экран
немного затемняется. а ещё ни этого окна, ни кнопок, ведущих в него, нет в мобильной версии. надо
добавить.

### R14. 2 elements: image, button "Заменить вещь в примерочн"

Оставить только слово заменить и перенести его отсюда на мини-карточку товара

## Page Feedback: /catalog

**Viewport:** 1386×868

### K1. `<__next_root_layout_boundary__>` body

Нужно добавить fav-иконку (иконку на вкладке в браузере) для всех страниц сайта.

### K2. `<FloatingPortal> <DrawerViewport> <DialogViewport> <DrawerPopup> <FloatingFocusManager> <DialogTitle>` h2 "Фильтры"

на мобильном этот блок начинаем медленно всплывать, потом разгоняеся, но тормозит не медленно.
Давай сделаем медленный разгон и медленное торможение. И вообще вся анимация должна быть плавной на
всём сайте.

### K3. `<CatalogBrowser> <CatalogCategoryToggle>` button "Все товары"

Давай эта штука будет раскрываться так же, как фильтры, а не выезжать вниз, толкая товары.

### K4. `<Providers> <HeaderSearchRow> <HeaderSearch> <SearchField> <Input> <FieldControl>` input "Товар, бренд или артикул"

нужно на мобильном следать открытие строки поиска при нажатии на кнопку, которая её открывает,
плавным.

## Page Feedback: /products/01a11854-a654-7878-a5f7-82a8305abd71

**Viewport:** 1386×868

### T1. `<DialogViewport> <DialogPopup> <FloatingFocusManager> <PhotoPicker> <PhotoFrame> <UploadPhoto>` "Видите только вы"

**Selected text:** "Видите только вы"

Написать "Ваше фото, видите только вы"

### T2. `<DialogPopup> <FloatingFocusManager> <PhotoPicker> <StartLookButton> <Button> <Button>` button "Примерить образ"

Если примерка не прошла по причине отказа сервиса, не связанного с предоставленной для генерации
фотки (например, сетевая ошибка, сервер не ответил), нужно сначала сделать ретрай (не
демонстрировать пользователю ошибку и какую либо информацию о ретрае), а уже если и он не пройдёт,
тогда показать ошибку. И кнопку примерить как на образе так и на одной вещи на мобильной версии
сделать стики и приклеить к низу экрана.

### T3. `<DialogRoot> <DialogPortal> <FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager>` upload photo

Если фотография в мои фото только одна, и пользователь нажал на заменить фото, то показывать здесь
эту одну фотку, которую он и так хочет заменить, не надо.

### T4. `<DialogPortal> <FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <Switch>` "Сохранить фото для следующих примерок"

Переносим эту функцию с экрана начала примерки и замены фото на экран с результатом генерации

### T5. `<DialogViewport> <DialogPopup> <FloatingFocusManager> <MyPhotosLink> <Link> <LinkComponent>` link "Перейти в «Мои фото»"

убрать эту кнопку

### T6. `<DialogPopup> <FloatingFocusManager> <PhotoPicker> <LookSubject> <ItemRow> <PickerItemActions>` "В корзину"

выровнять этот блок повыше, ближе к верхнему краю (на всех мини-карточках товара при примерке как
одной вещи, так и образа

### T7. `<FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <PhotoPicker> <LimitMeter>` "Образ целиком — 1 примерка · осталось 7"

добавить на всех экранах в конце этой фразы "в этом месяце"

### T8. `<__next_root_layout_boundary__> <Providers> <IconButton> <Button>` button [Избранное]

чип скоро сдвинуть левее и ниже, прмерно как цифру на иконуе примерки, и сделать серым

### T9. `<__next_root_layout_boundary__> <Providers> <IconButton> <Button>` button [Корзина]

чип скоро сдвинуть левее и ниже, прмерно как цифру на иконуе примерки, и сделать серым

### T10. `<__next_root_layout_boundary__> <Providers> <HeaderRoom> <FittingRoomButton> <IconButton> <Button>` button [Примерочная, 2 вещи]

цифра в чипе не отцентрована, отцентровать

### T11. `<Menu> <MenuRoot> <FloatingTree> <MenuTrigger> <IconButton> <Button>` button [Профиль]

здесь должен появляться чип с цифрой после того как завершилась примерка, если человек ушел с
экрана примерки. одновременно с поп-апом о завершении примерки. то же самое на "мои примерки",
которые появляются в менюшке, которая вылезает при нажатии этой кнопки.

### T12. 2 elements: image, list item: "+Аксессуары"

нужно добавить чип скоро

### T13. `<DrawerViewport> <DialogViewport> <DrawerPopup> <FloatingFocusManager> <DrawerContent> <RoomWishes>` textarea

нужно сделать это поле больше (в высоту)

### T14. `<DialogViewport> <DrawerPopup> <FloatingFocusManager> <DrawerContent> <CatalogRow> <LinkComponent>` link "Все товары"

над этим блоком задвоился разделитель и не очень понятно, где заканчиваются разделы профиля и
начинается каталог. давай как-то отделим. добавим надпись и оступ.

## Page Feedback: /customer/fittings?fitting=01a17c90-9f75-78be-9a14-12970204312b

**Viewport:** 1386×868

### H1. `<DialogViewport> <DialogPopup> <FloatingFocusManager> <FittingResult> <ResultTiles> <LookTile>` button "К образу"

Так как три соседние кнопки убираются, эту переместить в правую часть экрана

### H2. `<FloatingPortal> <DialogViewport> <DialogPopup> <FloatingFocusManager> <FittingResult> <LinkButton>` button "Примерить на другом фото"

когда после нажатия этой кнопки переводит на экран примерки, на экране примерки не должна
отображаться выбранная для примерки фотка, там должна быть просто дроп зона.

### H3. `<Tabs> <TabsRoot> <CompositeList> <TabsList> <CompositeRoot> <CompositeList>` div [Вид примерок]

вот тут черная полоска при переключении должна не прыгать, а плавно скользить между вариантами.

### H4. `<AccountShell> <SectionContent> <FittingHistory> <CompareBar> <Button> <Button>` button "Сравнить"

убираем эту кнопку отсюда и перерабатываем полностью функционал сравнения, переносим его на экрас
с результатом генерации.

### H5. `<DialogViewport> <DialogPopup> <FloatingFocusManager> <FittingResult> <ResultPicture> <PhotoFrame>` image "Сгенерированное изображение: в"

слева сбоку при наведении на фото с результатом генерации должны появляться маленькие иконки
других генераций пользователя, которые должны листаться вниз и вверх, и предложение сравнить. а
при сравнении должен появляться такой экран, на котором будет как бы две фотки (результата
генерации) в одном, и посередине ползунок, который можно двигать, и типа с одной его стороны одна
фотка, а с другой - другая.

### H6. `<DialogViewport> <DialogPopup> <FloatingFocusManager> <FittingResult> <ResultPicture> <PhotoFrame>` image "Сгенерированное изображение: в"

нужно ещё добавить функционал лайков и дизлайков. на фотке (результате генерации) сверху должны
появиться иконки для лайков и дизлайков (вся эта информация, конечно, должна храниться в базе
данных) и при нажатии на дизлайк должно появляться окошко с вопросом и том, что не понравилось, и
словами о том, что мы попробуем исправить. После того, как пользователь написал, что ему не
понравилось, мы сразу же его комментарий прикрепляем к промпту и перегенерируем. на один такой вот
пользовательский путь ставим лимит в две перегенерации. если он попытается сделать это в третий
раз, выводим окно обратной связи, чтобы он смог сказать, что не так, мы эту ифнормацию положили в
бд, но уже не перегенерировали. Ограничиваем вообще возможность реали зовать такой флоу пятью
примерками в месяц. и ещё надо за 3 отзыва о генерации дабать одну бесплатную примерку, и где-то
разместить для пользователя эту информацию. например, в тултипе оценки генерации.

## Page Feedback: /customer/stores

**Viewport:** 1386×868

### S1. `<__next_root_layout_boundary__> <Providers>` button "Укажите ваш населенный пу"

добавить определение населенного пункта по геолокации пользователя (запрашивать на неё разрешение,
как обычно это происходит в браузере) и возможность выбора населенного пункта.

### S2. `<AccountShell> <StoresView> <SearchField> <Input> <FieldControl>` input "Магазин, адрес или метро"

добавить дебаунс

### S3. `<AccountShell>` account shell

изначально показывать магазины в локации по гео пользователя

## Page Feedback: /products/01a11854-a697-7082-9948-cb325fa656b9

**Viewport:** 1386×868

### D1. `<DialogPopup> <FloatingFocusManager> <PhotoPicker> <PhotoFrame> <UploadPhoto> <FileInput>` button [Загрузить фото]

добавить возможность загрузки формата heic, вставления фото через cntrl/comnd+V, и как-то
переработаьь дроп-зону в целом. она сейчас не очень привлекательная, надо сделать так, чтобы в неё
прям хотелось загрузить фото.
