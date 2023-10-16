---
category:
  - Java
  - Spring
tag:
  - 虚拟线程
date: 2023-10-16
---

# 在Spring中使用虚拟线程

虚拟线程是轻量级线程，可以减少编写、维护和调试高吞吐量并发应用程序的工作量。虚拟线程在`JDK 19`中作为预览特性引入，在`JDK 21`中作为正式特性引入。

## 在Spring中启用虚拟线程

在最新版本的`Spring Framework`、`Spring boot`和`Apache Tomcat`中，你可以使用以下代码去自定义你的应用程序去使用虚拟线程去处理servlet请求：

```java
@Bean(TaskExecutionAutoConfiguration.APPLICATION_TASK_EXECUTOR_BEAN_NAME)
public AsyncTaskExecutor asyncTaskExecutor() {
  return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
}

@Bean
public TomcatProtocolHandlerCustomizer<?> protocolHandlerVirtualThreadExecutorCustomizer() {
  return protocolHandler -> {
    protocolHandler.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
  };
}
```

## Reference

1. [Embracing Virtual Threads](https://spring.io/blog/2022/10/11/embracing-virtual-threads)