/* DO NOT EDIT THIS FILE - it is machine generated */
#include <jni.h>
/* Header for class org_cozodb_CozoJavaBridge */

#ifndef _Included_org_cozodb_CozoJavaBridge
#define _Included_org_cozodb_CozoJavaBridge
#ifdef __cplusplus
extern "C" {
#endif
/*
 * Class:     org_cozodb_CozoJavaBridge
 * Method:    openDb
 * Signature: (Ljava/lang/String;Ljava/lang/String;)I
 */
JNIEXPORT jint JNICALL Java_org_cozodb_CozoJavaBridge_openDb
  (JNIEnv *, jclass, jstring, jstring);

/*
 * Class:     org_cozodb_CozoJavaBridge
 * Method:    closeDb
 * Signature: (I)Z
 */
JNIEXPORT jboolean JNICALL Java_org_cozodb_CozoJavaBridge_closeDb
  (JNIEnv *, jclass, jint);

/*
 * Class:     org_cozodb_CozoJavaBridge
 * Method:    runQuery
 * Signature: (ILjava/lang/String;Ljava/lang/String;)Ljava/lang/String;
 */
JNIEXPORT jstring JNICALL Java_org_cozodb_CozoJavaBridge_runQuery
  (JNIEnv *, jclass, jint, jstring, jstring);

/*
 * Class:     org_cozodb_CozoJavaBridge
 * Method:    exportRelations
 * Signature: (ILjava/lang/String;)Ljava/lang/String;
 */
JNIEXPORT jstring JNICALL Java_org_cozodb_CozoJavaBridge_exportRelations
  (JNIEnv *, jclass, jint, jstring);

/*
 * Class:     org_cozodb_CozoJavaBridge
 * Method:    importRelations
 * Signature: (ILjava/lang/String;)Ljava/lang/String;
 */
JNIEXPORT jstring JNICALL Java_org_cozodb_CozoJavaBridge_importRelations
  (JNIEnv *, jclass, jint, jstring);

/*
 * Class:     org_cozodb_CozoJavaBridge
 * Method:    backup
 * Signature: (ILjava/lang/String;)Ljava/lang/String;
 */
JNIEXPORT jstring JNICALL Java_org_cozodb_CozoJavaBridge_backup
  (JNIEnv *, jclass, jint, jstring);

/*
 * Class:     org_cozodb_CozoJavaBridge
 * Method:    restore
 * Signature: (ILjava/lang/String;)Ljava/lang/String;
 */
JNIEXPORT jstring JNICALL Java_org_cozodb_CozoJavaBridge_restore
  (JNIEnv *, jclass, jint, jstring);

#ifdef __cplusplus
}
#endif
#endif