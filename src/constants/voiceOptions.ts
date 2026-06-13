/**
 * TTS 音色元数据模块
 *
 * 本模块集中管理可选 TTS Provider 的音色元数据和工具函数。
 * 所有需要音色列表的组件应从此模块导入，而非硬编码。
 *
 * Community Edition 默认不会连接任何云厂商服务。这里保留的 provider
 * 标识和音色 ID 仅用于本地项目兼容、自托管服务或第三方适配器映射。
 */

/** TTS Provider 元数据标识。 */
export type VoiceProviderId = 'tencent' | 'baidu'

/** @deprecated Use VoiceProviderId for new code. */
export type TTSEngine = VoiceProviderId

/**
 * 音色选项接口
 */
export interface VoiceOption {
    /** 音色 ID（由具体 Provider 适配器解释） */
    id: number
    /** 显示名称 */
    name: string
    /** 性别 */
    gender: 'male' | 'female'
    /** 音色描述标签 */
    description: string
    /** 所属 Provider 元数据标识 */
    engine: VoiceProviderId
}

/**
 * 可用音色元数据列表。
 */
export const VOICE_OPTIONS: VoiceOption[] = [
    // ================================================================
    // Tencent-compatible provider metadata（48 个）
    // 参考：doc-prd/Tencent_TTS_API.md
    // ================================================================

    // --- 超自然大模型 ---
    { id: 502001, name: '智小柔', gender: 'female', description: '温柔亲和', engine: 'tencent' },
    { id: 502003, name: '智小敏', gender: 'female', description: '活力女声', engine: 'tencent' },
    { id: 502004, name: '智小满', gender: 'female', description: '客服女声', engine: 'tencent' },
    { id: 502005, name: '智小解', gender: 'male', description: '解说男声', engine: 'tencent' },
    { id: 502006, name: '智小悟', gender: 'male', description: '阳光男声', engine: 'tencent' },
    { id: 502007, name: '智小虎', gender: 'male', description: '演绎童声', engine: 'tencent' },
    { id: 602003, name: '爱小悠', gender: 'female', description: '情感丰富', engine: 'tencent' },
    { id: 602004, name: '暖心阿灿', gender: 'male', description: '沉稳大气', engine: 'tencent' },
    { id: 602005, name: '专业梓欣', gender: 'female', description: '活力亲和', engine: 'tencent' },
    { id: 603000, name: '懂事少年', gender: 'male', description: '懂事少年', engine: 'tencent' },
    { id: 603001, name: '潇湘妹妹', gender: 'female', description: '趣味女声', engine: 'tencent' },
    { id: 603002, name: '软萌心心', gender: 'male', description: '趣味童声', engine: 'tencent' },
    { id: 603003, name: '随和老李', gender: 'male', description: '随和沉稳', engine: 'tencent' },
    { id: 603004, name: '温柔小柠', gender: 'female', description: '温柔亲和', engine: 'tencent' },
    { id: 603005, name: '知心大林', gender: 'male', description: '成熟磁性', engine: 'tencent' },
    { id: 603006, name: '沉稳青叔', gender: 'male', description: '沉稳磁性', engine: 'tencent' },
    { id: 603007, name: '邻家女孩', gender: 'female', description: '亲切自然', engine: 'tencent' },

    // --- 大模型 ---
    { id: 501000, name: '智斌', gender: 'male', description: '磁性男声', engine: 'tencent' },
    { id: 501001, name: '智兰', gender: 'female', description: '轻快女声', engine: 'tencent' },
    { id: 501002, name: '智菊', gender: 'female', description: '端庄大方', engine: 'tencent' },
    { id: 501003, name: '智宇', gender: 'male', description: '成熟大叔', engine: 'tencent' },
    { id: 501004, name: '月华', gender: 'female', description: '气质聪慧', engine: 'tencent' },
    { id: 501005, name: '飞镜', gender: 'male', description: '温和男声', engine: 'tencent' },
    { id: 501006, name: '千嶂', gender: 'male', description: '沉稳大气', engine: 'tencent' },
    { id: 501007, name: '浅草', gender: 'male', description: '青春男声', engine: 'tencent' },
    { id: 501008, name: 'WeJames', gender: 'male', description: '外语男声', engine: 'tencent' },
    { id: 501009, name: 'WeWinny', gender: 'female', description: '外语女声', engine: 'tencent' },
    { id: 601008, name: '爱小豪', gender: 'male', description: '霸道高冷', engine: 'tencent' },
    { id: 601009, name: '爱小芊', gender: 'female', description: '清纯灵巧', engine: 'tencent' },
    { id: 601010, name: '爱小娇', gender: 'female', description: '娇媚女声', engine: 'tencent' },
    { id: 601011, name: '爱小川', gender: 'male', description: '活力少年', engine: 'tencent' },
    { id: 601012, name: '爱小璟', gender: 'female', description: '可爱萝莉', engine: 'tencent' },
    { id: 601013, name: '爱小伊', gender: 'female', description: '知性姐姐', engine: 'tencent' },
    { id: 601014, name: '爱小简', gender: 'male', description: '清爽学生', engine: 'tencent' },

    // --- 精品 ---
    { id: 101001, name: '智瑜', gender: 'female', description: '优雅知性姐姐', engine: 'tencent' },
    { id: 101004, name: '智云', gender: 'male', description: '阅读男声', engine: 'tencent' },
    { id: 101011, name: '智燕', gender: 'female', description: '有气场的女播音员', engine: 'tencent' },
    { id: 101013, name: '智辉', gender: 'male', description: '新闻播音员', engine: 'tencent' },
    { id: 101015, name: '智萌', gender: 'male', description: '纯真小朋友', engine: 'tencent' },
    { id: 101016, name: '智甜', gender: 'female', description: '可爱萌宝宝', engine: 'tencent' },
    { id: 101019, name: '智彤', gender: 'female', description: '时尚粤语姐姐', engine: 'tencent' },
    { id: 101021, name: '智瑞', gender: 'male', description: '新闻播音员', engine: 'tencent' },
    { id: 101026, name: '智希', gender: 'female', description: '甜美小助手', engine: 'tencent' },
    { id: 101027, name: '智梅', gender: 'female', description: '柔美大方', engine: 'tencent' },
    { id: 101030, name: '智柯', gender: 'male', description: '自然轻快', engine: 'tencent' },
    { id: 101054, name: '智友', gender: 'male', description: '解说小哥哥', engine: 'tencent' },
    { id: 101055, name: '智付', gender: 'female', description: '智能收银员', engine: 'tencent' },

    // ================================================================
    // Baidu-compatible provider metadata（76 个）
    // 参考：doc-prd/Baidu_TTS_API.md
    // ================================================================

    // --- 基础音库 ---
    { id: 0, name: '度小美', gender: 'female', description: '标准女主播', engine: 'baidu' },
    { id: 1, name: '度小宇', gender: 'male', description: '亲切男声', engine: 'baidu' },
    { id: 3, name: '度逍遥', gender: 'male', description: '情感男声', engine: 'baidu' },
    { id: 4, name: '度丫丫', gender: 'female', description: '童声', engine: 'baidu' },

    // --- 精品音库 ---
    { id: 5003, name: '度逍遥', gender: 'male', description: '情感男声', engine: 'baidu' },
    { id: 5118, name: '度小鹿', gender: 'female', description: '甜美女声', engine: 'baidu' },
    { id: 106, name: '度博文', gender: 'male', description: '专业男主播', engine: 'baidu' },
    { id: 103, name: '度米朵', gender: 'female', description: '可爱童声', engine: 'baidu' },
    { id: 110, name: '度小童', gender: 'male', description: '童声主播', engine: 'baidu' },
    { id: 111, name: '度小萌', gender: 'female', description: '软萌妹子', engine: 'baidu' },
    { id: 5, name: '度小娇', gender: 'female', description: '成熟女主播', engine: 'baidu' },

    // --- 臻品音库 ---
    { id: 4003, name: '度逍遥', gender: 'male', description: '情感男声', engine: 'baidu' },
    { id: 4106, name: '度博文', gender: 'male', description: '专业男主播', engine: 'baidu' },
    { id: 4115, name: '度小贤', gender: 'male', description: '电台男主播', engine: 'baidu' },
    { id: 5147, name: '度常盈', gender: 'female', description: '电台女主播', engine: 'baidu' },
    { id: 5976, name: '度小皮', gender: 'male', description: '萌娃童声', engine: 'baidu' },
    { id: 5971, name: '度皮特', gender: 'male', description: '老外男声', engine: 'baidu' },
    { id: 4164, name: '度阿肯', gender: 'male', description: '主播男声', engine: 'baidu' },
    { id: 4176, name: '度有为', gender: 'male', description: '磁性男声', engine: 'baidu' },
    { id: 4259, name: '度小新', gender: 'female', description: '播音女声', engine: 'baidu' },
    { id: 4119, name: '度小鹿', gender: 'female', description: '甜美女声', engine: 'baidu' },
    { id: 4105, name: '度灵儿', gender: 'female', description: '清激女声', engine: 'baidu' },
    { id: 4117, name: '度小乔', gender: 'female', description: '活泼女声', engine: 'baidu' },
    { id: 4288, name: '度晴岚', gender: 'female', description: '甜美女声', engine: 'baidu' },
    { id: 4192, name: '度青川', gender: 'male', description: '温柔男声', engine: 'baidu' },
    { id: 4100, name: '度小雯', gender: 'female', description: '活力女主播', engine: 'baidu' },
    { id: 4103, name: '度米朵', gender: 'female', description: '可爱女声', engine: 'baidu' },
    { id: 4144, name: '度姗姗', gender: 'female', description: '娱乐女声', engine: 'baidu' },
    { id: 4278, name: '度小贝', gender: 'female', description: '知识女主播', engine: 'baidu' },
    { id: 4143, name: '度清风', gender: 'male', description: '配音男声', engine: 'baidu' },
    { id: 4140, name: '度小新', gender: 'female', description: '专业女主播', engine: 'baidu' },
    { id: 4129, name: '度小彦', gender: 'male', description: '知识男主播', engine: 'baidu' },
    { id: 4149, name: '度星河', gender: 'male', description: '广告男声', engine: 'baidu' },
    { id: 4254, name: '度小清', gender: 'female', description: '广告女声', engine: 'baidu' },
    { id: 4206, name: '度博文', gender: 'male', description: '综艺男声', engine: 'baidu' },
    { id: 4147, name: '度云朵', gender: 'female', description: '可爱童声', engine: 'baidu' },
    { id: 4141, name: '度婉婉', gender: 'female', description: '甜美女声', engine: 'baidu' },
    { id: 4226, name: '南方', gender: 'female', description: '电台女主播', engine: 'baidu' },
    { id: 6205, name: '度悠然', gender: 'male', description: '旁白男声', engine: 'baidu' },
    { id: 6221, name: '度云萱', gender: 'female', description: '旁白女声', engine: 'baidu' },
    { id: 6546, name: '度清豪', gender: 'male', description: '逍遥侠客', engine: 'baidu' },
    { id: 6602, name: '度清柔', gender: 'male', description: '温柔男神', engine: 'baidu' },
    { id: 6562, name: '度雨楠', gender: 'female', description: '元气少女', engine: 'baidu' },
    { id: 6543, name: '度雨萌', gender: 'female', description: '邻家女孩', engine: 'baidu' },
    { id: 6747, name: '度书古', gender: 'male', description: '情感男声', engine: 'baidu' },
    { id: 6748, name: '度书严', gender: 'male', description: '沉稳男声', engine: 'baidu' },
    { id: 6746, name: '度书道', gender: 'male', description: '沉稳男声', engine: 'baidu' },
    { id: 6644, name: '度书宁', gender: 'female', description: '亲和女声', engine: 'baidu' },
    { id: 4148, name: '度小夏', gender: 'female', description: '甜美女声', engine: 'baidu' },
    { id: 4277, name: '西贝', gender: 'female', description: '脱口秀女声', engine: 'baidu' },
    { id: 4114, name: '阿龙', gender: 'male', description: '说书男声', engine: 'baidu' },
    { id: 5153, name: '度常悦', gender: 'female', description: '民生女主播', engine: 'baidu' },
    { id: 6561, name: '度小乐', gender: 'male', description: '可爱童声', engine: 'baidu' },

    // --- 大模型音库 ---
    { id: 4179, name: '度泽言', gender: 'male', description: '温暖男声', engine: 'baidu' },
    { id: 4146, name: '度禧禧', gender: 'female', description: '阳光女声', engine: 'baidu' },
    { id: 6567, name: '度小柔', gender: 'female', description: '温柔女声', engine: 'baidu' },
    { id: 4156, name: '度言浩', gender: 'male', description: '年轻男声', engine: 'baidu' },
    { id: 4157, name: '度言静', gender: 'female', description: '明亮女声', engine: 'baidu' },
    { id: 4189, name: '度涵竹', gender: 'female', description: '开朗女声', engine: 'baidu' },
    { id: 4194, name: '度嫣然', gender: 'female', description: '活泼女声', engine: 'baidu' },
    { id: 4193, name: '度泽言', gender: 'male', description: '开朗男声', engine: 'baidu' },
    { id: 4195, name: '度怀安', gender: 'male', description: '磁性男声', engine: 'baidu' },
    { id: 4196, name: '度清影', gender: 'female', description: '甜美女声', engine: 'baidu' },
    { id: 4197, name: '度沁遥', gender: 'female', description: '知性女声', engine: 'baidu' },
    { id: 20100, name: '度小粤', gender: 'female', description: '粤语女声', engine: 'baidu' },
    { id: 20101, name: '度晓芸', gender: 'female', description: '粤语女声', engine: 'baidu' },
    { id: 4257, name: '四川小哥', gender: 'male', description: '四川男声', engine: 'baidu' },
    { id: 4132, name: '度阿闽', gender: 'male', description: '闽南男声', engine: 'baidu' },
    { id: 4139, name: '度小蓉', gender: 'female', description: '四川女声', engine: 'baidu' },
    { id: 5977, name: '台媒女声', gender: 'female', description: '台湾女声', engine: 'baidu' },
    { id: 4007, name: '度小台', gender: 'female', description: '台湾女声', engine: 'baidu' },
    { id: 4150, name: '度湘玉', gender: 'female', description: '陕西女声', engine: 'baidu' },
    { id: 4134, name: '度阿锦', gender: 'female', description: '东北女声', engine: 'baidu' },
    { id: 4172, name: '度筱林', gender: 'female', description: '天津女声', engine: 'baidu' },
    { id: 5980, name: '度阿花', gender: 'female', description: '上海女声', engine: 'baidu' },
    { id: 4154, name: '度老崔', gender: 'male', description: '北京男声', engine: 'baidu' },
]

/**
 * 默认音色 ID（按性别）
 */
export const DEFAULT_VOICE_ID = {
    female: 101026,
    male: 101030,
    other: 101026,   // 默认女声
} as const

/**
 * 通用默认音色（作为回退值）
 */
export const FALLBACK_VOICE_ID = 101026 // 智希

// ==================== 工具函数 ====================

/**
 * 获取所有音色选项
 */
export function getVoiceOptions(): VoiceOption[] {
    return VOICE_OPTIONS
}

/**
 * 根据 ID 获取音色选项
 */
export function getVoiceById(id: number | string | undefined): VoiceOption | undefined {
    if (id === undefined) return undefined
    const numId = typeof id === 'string' ? parseInt(id, 10) : id
    return VOICE_OPTIONS.find(v => v.id === numId)
}

/**
 * 根据 ID 获取音色显示名称
 */
export function getVoiceName(id: number | string | undefined): string {
    if (id === undefined) return '未设置'
    const voice = getVoiceById(id)
    if (!voice) {
        return `音色 ${id}`
    }
    const genderLabel = voice.gender === 'female' ? '女' : '男'
    return `${voice.name} (${genderLabel})`
}

/**
 * 根据性别获取默认音色 ID
 */
export function getDefaultVoiceIdByGender(gender: string): number {
    if (gender === 'female') {
        return DEFAULT_VOICE_ID.female
    }
    if (gender === 'male') {
        return DEFAULT_VOICE_ID.male
    }
    return DEFAULT_VOICE_ID.other
}

/**
 * 获取女声列表
 */
export function getFemaleVoices(): VoiceOption[] {
    return VOICE_OPTIONS.filter(v => v.gender === 'female')
}

/**
 * 获取男声列表
 */
export function getMaleVoices(): VoiceOption[] {
    return VOICE_OPTIONS.filter(v => v.gender === 'male')
}

/**
 * 根据音色 ID 获取所属 Provider 元数据标识。
 */
export function getVoiceEngine(id: number | string | undefined): VoiceProviderId {
    if (id === undefined) return 'tencent'
    const voice = getVoiceById(id)
    return voice?.engine ?? 'tencent'
}

const TENCENT_ULTRA_NATURAL = new Set([
    502001, 502003, 502004, 502005, 502006, 502007,
    602003, 602004, 602005,
    603000, 603001, 603002, 603003, 603004, 603005, 603006, 603007,
])

const TENCENT_LLM = new Set([
    501000, 501001, 501002, 501003, 501004, 501005, 501006, 501007, 501008, 501009,
    601008, 601009, 601010, 601011, 601012, 601013, 601014,
])

const BAIDU_BASIC = new Set([0, 1, 3, 4])
const BAIDU_PREMIUM = new Set([5003, 5118, 106, 103, 110, 111, 5])
const BAIDU_LLM = new Set([
    4179, 4146, 6567, 4156, 4157, 4189, 4194, 4193, 4195, 4196, 4197,
    20100, 20101, 4257, 4132, 4139, 5977, 4007, 4150, 4134, 4172, 5980, 4154,
])

/**
 * 获取音色成本权重提示。
 *
 * 该值只用于可选 TTS Provider 的 UI 提示，不代表开源版内置计费，
 * 也不意味着默认连接任何云服务。
 */
export function getVoiceCostWeight(voice: Pick<VoiceOption, 'engine' | 'id'>): number {
    if (voice.engine === 'baidu') {
        if (BAIDU_BASIC.has(voice.id)) return 2.67
        if (BAIDU_PREMIUM.has(voice.id)) return 5.33
        if (BAIDU_LLM.has(voice.id)) return 6
        return 6
    }

    if (TENCENT_ULTRA_NATURAL.has(voice.id)) return 21.67
    if (TENCENT_LLM.has(voice.id)) return 4
    return 1
}

/**
 * 获取音色卡片展示用成本档位。
 */
export function getVoiceCostTier(voice: Pick<VoiceOption, 'engine' | 'id'>): number {
    return Math.ceil(getVoiceCostWeight(voice))
}

export function getVoiceCostTierLabel(voice: Pick<VoiceOption, 'engine' | 'id'>): string {
    return `${getVoiceCostTier(voice)}档`
}

// ========== 语速设置 ==========

/**
 * 语速选项接口
 */
export interface SpeedOption {
    /** 通用语速参数值，兼容历史 Provider 映射范围 (-2 ~ 6) */
    value: number
    /** 显示标签 */
    label: string
    /** 简短描述 */
    description: string
}

/**
 * 语速选项列表（语义化标签）。
 * 具体 Provider 可在适配器中映射到自己的语速参数范围。
 */
export const SPEED_OPTIONS: SpeedOption[] = [
    { value: -2, label: '较慢', description: '约 0.67 倍速' },
    { value: -1, label: '稍慢', description: '约 0.83 倍速' },
    { value: 0, label: '正常', description: '1.0 倍速' },
    { value: 2, label: '稍快', description: '约 1.33 倍速' },
    { value: 4, label: '较快', description: '约 1.67 倍速' },
    { value: 6, label: '很快', description: '约 2.0 倍速' },
]

/**
 * 默认语速值（正常）
 */
export const DEFAULT_SPEED = 0

/**
 * 默认音量值（TTS API 中性音量）
 */
export const DEFAULT_VOLUME = 0

/**
 * 获取所有语速选项
 */
export function getSpeedOptions(): SpeedOption[] {
    return SPEED_OPTIONS
}

/**
 * 根据 TTS 参数值获取语速标签
 */
export function getSpeedLabel(value: number): string {
    const option = SPEED_OPTIONS.find(o => o.value === value)
    return option?.label ?? '正常'
}

/**
 * 将旧版倍速值 (0.5 ~ 2.0) 转换为新版 TTS 参数值
 * 用于数据迁移
 */
export function convertLegacySpeedToTTSValue(legacySpeed: number): number {
    if (legacySpeed <= 0.7) return -2
    if (legacySpeed <= 0.9) return -1
    if (legacySpeed <= 1.1) return 0
    if (legacySpeed <= 1.4) return 2
    if (legacySpeed <= 1.8) return 4
    return 6
}

/**
 * 判断值是否为旧版倍速格式（0.5 ~ 2.0）
 * 新版使用标准值: -2, -1, 0, 2, 4, 6
 */
export function isLegacySpeedFormat(speed: number): boolean {
    const validNewValues = [-2, -1, 0, 2, 4, 6]
    return speed > 0 && speed <= 2.5 && !validNewValues.includes(speed)
}

/**
 * 智能获取 TTS 语速参数值
 * 自动处理旧版格式转换
 */
export function getValidSpeedValue(speed: number | undefined): number {
    if (speed === undefined) return DEFAULT_SPEED

    // 检测并转换旧版格式（0.5-2.0 范围内的非标准值）
    if (isLegacySpeedFormat(speed)) {
        return convertLegacySpeedToTTSValue(speed)
    }

    // 确保值在有效范围内
    if (speed < -2) return -2
    if (speed > 6) return 6

    return speed
}

/**
 * 智能获取本地播放音量参数值。
 *
 * 音量不再传给 TTS 供应商，而是在前端播放/导出混音阶段用作增益。
 */
export function getValidVolumeValue(volume: number | undefined): number {
    if (volume === undefined) return DEFAULT_VOLUME

    const rounded = Math.round(volume)
    if (rounded < -10) return -10
    if (rounded > 10) return 10
    return rounded
}

/**
 * 将 -10 ~ 10 的用户音量映射为本地播放增益。
 * 0 为原始音量，10 约为 10 倍增益，-10 约为 1/10 音量。
 */
export function getPlaybackVolumeGain(volume: number | undefined): number {
    const normalized = getValidVolumeValue(volume)
    return Math.pow(10, normalized / 10)
}

export function getPlaybackVolumePercent(volume: number | undefined): number {
    return Math.round(getPlaybackVolumeGain(volume) * 100)
}
