"""
we have many button / ui element => set a name, we will use name in python to explain what i want do
輸入的壞習慣名稱 = habit_name
目前的步驟 (1~5) = current_step
是否帶有大腦偏誤(長期打一折) = is_biased
短期清單 = st_list
長期清單 = lt_list
短期總分 = st_total
長期總分 = lt_total

# 按鈕定義
進入分析系統 = go_to_step_2
加入短期清單 = add_st
加入長期清單 = add_lt
看見真實的代價 = see_truth
了解習慣如何運作 = learn_loop
進入最後一步：改變物理現實 = final_step
加入短期阻力 = add_friction
重新分析另一個習慣 = reset_app

# UI 顯示功能
更新天平與重力系統 = update_scale
檢查是否成功破除習慣 = check_success
渲染畫面清單 = render_lists

there is one speacial function, it will return this funcion touched:
touched

there are some UI animation functions:
strike_through_animation(x) # 畫上紅色刪除線並淡出
show_success_msg() # 彈出綠色的成功慶祝區塊
tilt_scale(angle) # 讓天平傾斜指定角度
"""

# ==========================================
# Init System Variables
# ==========================================
habit_name = ""
current_step = 1
is_biased = 1  # 預設大腦有 1/10 偏誤 (1=Yes, 0=No)
st_list = []   # list of dict: [{"name": string, "score": int}]
lt_list = []
st_total = 0
lt_total = 0
scale_angle = 0 # UI design: max 30, min -30. 負數往左(短期)傾斜，正數往右(長期)傾斜

# ==========================================
# Pseudo Event / UI Helpers
# ==========================================
def touched(ob):
    if "user touch this button":
        return 1
    return 0

def strike_through_animation(element):
    return f"play strike-through and fade-out animation for {element}"

def tilt_scale(angle):
    return f"CSS transform: rotate({angle}deg)"

def show_success_msg():
    return "UI design: show green block 🎉 恭喜！你成功重塑了性價比！"

# ==========================================
# Core Logic & Buttons
# ==========================================
def go_to_step_2(input_text):
    global habit_name, current_step
    if touched(go_to_step_2):
        if input_text == "":
            print("alert: 請輸入你想戒除的習慣！")
            return "failed"
        
        habit_name = input_text
        current_step = 2
        print(f"show scale UI, title: 分析：「{habit_name}」")
        update_scale()
        return "go to step 2"

def add_st(name, score):
    global st_list
    if touched(add_st):
        if name == "" or "score is not a number":
            print("alert: 請輸入完整的名稱與分數！")
            return "failed"
            
        st_list.append({"name": name, "score": score})
        render_lists()
        update_scale()
        
        if len(st_list) > 0 and len(lt_list) > 0:
            print("show 'see_truth' button")

def add_lt(name, score):
    global lt_list
    if touched(add_lt):
        if name == "" or "score is not a number":
            print("alert: 請輸入完整的名稱與分數！")
            return "failed"
            
        lt_list.append({"name": name, "score": score})
        render_lists()
        update_scale()
        
        if len(st_list) > 0 and len(lt_list) > 0:
            print("show 'see_truth' button")

def see_truth():
    global current_step, is_biased
    if touched(see_truth):
        current_step = 3
        
        # 核心視覺衝擊：破除大腦偏誤
        strike_through_animation("bias_watermark (× ⅒)")
        is_biased = 0
        
        # 延遲一下讓動畫跑完，再重新計算天平，此時天平會猛烈倒向長期！
        if "wait 0.8 seconds":
            update_scale()
            
        return "go to step 3"

def learn_loop():
    global current_step
    if touched(learn_loop):
        current_step = 4
        print("hide scale system, show habit loop card (慾望->多巴胺->行動)")
        return "go to step 4"

def final_step():
    global current_step
    if touched(final_step):
        current_step = 5
        print("show scale system again")
        render_lists()
        update_scale()
        return "go to step 5"

def add_friction(name, score):
    global st_list
    if touched(add_friction):
        if score > 0:
            print("alert: 請輸入負數！這裡是為了增加摩擦力與不爽度！")
            return "failed"
            
        st_list.append({"name": name, "score": score})
        render_lists()
        update_scale()
        check_success()

def reset_app():
    if touched(reset_app):
        print("location.reload()")
        return "restart system"

# ==========================================
# Engine Functions (Physics & Logic)
# ==========================================
def render_lists():
    # loop st_list and lt_list to create HTML <li> elements
    # if score >= 0 -> text green (+)
    # if score < 0  -> text red (-)
    pass

def update_scale():
    global st_total, lt_total, scale_angle
    
    st_total = sum([item["score"] for item in st_list])
    lt_total = sum([item["score"] for item in lt_list])
    
    # 短期誘惑的重量 (往下壓左邊)
    left_force = st_total
    
    # 長期代價的重量 (往下壓右邊，只算負面代價的絕對值做為阻力)
    if lt_total < 0:
        right_force = abs(lt_total)
    else:
        right_force = 0
        
    # 【原子習慣核心：大腦對未來的盲目】
    if is_biased == 1:
        right_force = right_force * 0.1
        
    # 計算傾斜角度 (diff > 0 往右倒，diff < 0 往左倒)
    diff = right_force - left_force
    scale_angle = diff * 0.3 # 0.3 是一個 UI 視覺係數
    
    # 物理限制：最多傾斜 30 度
    if scale_angle > 30:
        scale_angle = 30
    elif scale_angle < -30:
        scale_angle = -30
        
    tilt_scale(scale_angle)

def check_success():
    global current_step, st_total
    # 當到達第五步(駭入系統階段)，且成功將短期總分壓到負數時
    if current_step == 5 and st_total <= 0:
        show_success_msg()
        return "system hacked, habit broken!"