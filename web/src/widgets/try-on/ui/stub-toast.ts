import { showToast } from '@/shared/ui';

// The cart and the favourites are not in the prototype (spec 0019 A33): their buttons answer this.
export function showStubToast(): void {
  showToast({ title: 'В прототипе нет корзины и избранного' });
}
