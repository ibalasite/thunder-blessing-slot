/**
 * Cocos Creator 'cc' 模組的最小 stub
 * 讓不依賴 cc 的純邏輯檔案在 Jest 下可正常 import
 */
export const Component = class {};
export const _decorator = {
    ccclass: () => () => {},
    property: () => () => {},
    requireComponent: () => () => {},
};
export const Node = class {};
export const Label = class {};
export const Sprite = class {};
export const Color = class {};
export const Vec2 = class {};
export const Vec3 = class {};
export const tween = () => ({ to: () => ({}), start: () => ({}) });
export const Tween = class {};
export const director = { getScene: () => null };
export const game = {};
export const sys = { platform: 0 };
export const resources = { load: () => {} };
export default {};
