"""
cp_value =Price-Performance Ratio 性價比

"""


class tree():
    def __init__(self, name):
        self.name = name
        self.data_name=None
        self.data=None
        self.children = []
human=tree("human")
#the tree will shown in UI(after first action created or log in(we dont do log in now, but we do after first action created)), looks like normal. which means user probably not a coding guy. so we show normal tree.
#as tree shown, every node can be tap, after tapping, we need to init_action_of_base_demand() when he tap action object. if he tap base demand, we show "do you want delete the base demand?". after last children of tree class object. shows a "+" addition ,which means add action or base demand.
base_demand=[]
for i in range(1, 11):
    base_demand.append(i)#these means most known human base demand
    #user can add more base demand

for rs in base_demand:
    human.children.append(tree(f"base demand:{rs}"))#user can add more base demand
    human.children[-1].data_name="action for the base demand"
    human.children[-1].data={}#sort by cp_value, kind of c++ map.
    for i in range(1, 11):
        human.children[-1].data[f"action {i}"]=i/10#these means most known action for the base demand, and their cp_value
        #user can add more action for the base demand, and their cp_value

def init_action_of_base_demand():
    #every time user try to edit action in base demand, they should follow this function, and our UI also should follow
    #separate cp_value to short time and long time
    #when user is not init a action, but at least second time see the action. make sure he know if short time cp_value <0, habit will be give up by your brain, force him make short time cp_value at least >0, this is when it long cp_value >0, which means good habit. if long cp_value <0,which mean bad habit, so we force user make short time cp_value <0 instead.
    #at any time, we let user know habit can be separate to 4 part, 提示 -> 渴望 -> 回應 -> 獎賞,and when user init action, they should make cp_value object to these 4 part, will be remember but it wont change cp_value score.

    pass