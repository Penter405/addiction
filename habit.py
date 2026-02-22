good=[]
bad=[]
help(list)
less_than_avarage=0.5
dopamine_to_a_thing=0#initial


def Dopamine(thing, level=1):
    global dopamine_to_a_thing
    dopamine_to_a_thing=level
    #use Dopamine to let human wanna do thing, or wanna not to do thing.
    pass

def add_list(thing, lastest_requests):
    if thing in good:
        if sum(lastest_requests)<0:
            good.remove(thing)
            bad.append(thing)
            

def do(thing):
    #do the thing
    requests=0#it could be any float or integer
    return requests

def habit(thing):
    if thing in good:
        Dopamine(thing)
        #it could as good as experience
    elif thing in bad:
        Dopamine(thing, less_than_avarage)
    else:
        #now it never been list, we dont know pro and cons
        Dopamine(thing)
    if dopamine_to_a_thing>0.5:
        requests=do(thing)
        add_list(thing,requests)
    else:
        #dont do the thing
        pass