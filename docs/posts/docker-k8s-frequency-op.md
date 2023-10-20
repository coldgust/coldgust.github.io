---
category:
  - docker
  - k8s
tag:
  - 容器
date: 2023-10-21
---

# docker和k8s常用操作

本文主要记录docker和k8s常用的一些命令之类的，方便查阅。

## 容器不退出

容器在执行完`CMD`或者`ENTRYPOINT`之后，或者执行过程中出错，都会使容器退出。一般来说，执行出错时，我们希望进入容器调试报错原因。可以把容器的`Command`改为：

```shell
/bin/bash -c "while true; do sleep 30; done"
```

在K8s的yaml文件里：

```yaml
containers:
  - name: xxx
    image: xxx
    command:
      - /bin/bash
    args:
      - '-c'
      - while true; do sleep 30; done
```

使用docker命令：

```shell
docker run ubuntu /bin/bash -c "while true; do sleep 30; done"
```

## 使用root登录容器

注意使用`kubectl`不支持`-u`参数。一般来说只能找到该容器所在的主机，然后再到主机上用`docker`使用root登录。

```shell
docker exec -it -uroot CONTAINER COMMAND
```

## 特权容器

有时候，有些命令在容器里执行需要特权模式，例如：`gdb`用到的`ptrace`。只建议在测试环境使用特权模式。

在`k8s`的yaml文件里配置：

```yaml
containers:
  - name: xxx
    images: xxx
    securityContext:
      capabilities:
        add:
          - SYS_PTRACE
```

## 将image保存为tar包

在offline环境中，经常需要把image打包成tar再带进去。

```shell
docker save -o xxx.tar ubuntu:23.04
```

## 将tar加载为image

```shell
docker load -i xxx.tar
```

## 容器与主机文件相互复制

```shell
docker cp source target
```

例如：从本地复制到容器

```shell
docker cp ./some_file CONTAINER:/work
```

从容器复制到本地

```shell
docker cp ./some_file CONTAINER:/work
```

在`k8s`里把`docker`改为`kubectl`即可。

## 删除<none>镜像

```shell
docker image prune -f
```